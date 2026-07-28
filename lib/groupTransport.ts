// Group chat transport — end-to-end encrypted, additive to the 1-on-1 engine.
//
// A group message is encrypted once per member using the same pairwise ECDH the
// members already use 1-on-1 (encryptForRecipients). The DB stores a
// { recipientId -> {ciphertext, iv} } map; each member decrypts only their own
// entry with the sender's public key. The server never sees plaintext.

import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptForRecipients, decryptFromSender, type GroupMember } from "./crypto";
import type { WirePayload } from "./types";

export interface GroupContext {
  supabase: SupabaseClient;
  userId: string;
  username: string;
  keyPair: CryptoKeyPair;
}

export interface GroupEvents {
  onReady: (name: string, members: { id: string; username: string }[]) => void;
  onMessage: (text: string, payload: WirePayload, mine: boolean) => void;
  onError?: (message: string) => void;
}

interface GroupMessageRow {
  id: string;
  group_id: string;
  sender_id: string;
  recipients: Record<string, { ciphertext: string; iv: string }>;
  created_at: string;
}

const HISTORY_PAGE = 50;

export class GroupTransport {
  private sb: SupabaseClient;
  private channel: ReturnType<SupabaseClient["channel"]> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<string>();
  // member id -> { username, publicKey(base64) }
  private members = new Map<string, { username: string; publicKey: string }>();

  constructor(
    private groupId: string,
    private events: GroupEvents,
    private ctx: GroupContext
  ) {
    this.sb = ctx.supabase;
  }

  async start() {
    // 1. Group + members (with each member's public key for pairwise encryption).
    const { data: group, error: gErr } = await this.sb
      .from("groups")
      .select("name")
      .eq("id", this.groupId)
      .maybeSingle();
    if (gErr || !group) {
      this.events.onError?.(gErr?.message || "Group not found");
      return;
    }
    const { data: mems } = await this.sb
      .from("group_members")
      .select("user_id, profiles!inner(username, public_key)")
      .eq("group_id", this.groupId);

    type MemRow = { user_id: string; profiles: { username: string; public_key: string } };
    for (const m of (mems as unknown as MemRow[] | null) || []) {
      this.members.set(m.user_id, { username: m.profiles.username, publicKey: m.profiles.public_key });
    }
    this.events.onReady(
      group.name as string,
      [...this.members.entries()].map(([id, v]) => ({ id, username: v.username }))
    );

    // 2. History (most recent page).
    const { data: history } = await this.sb
      .from("group_messages")
      .select("id, group_id, sender_id, recipients, created_at")
      .eq("group_id", this.groupId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_PAGE);
    for (const row of ((history as GroupMessageRow[] | null) || []).reverse()) {
      await this.deliver(row);
    }

    // 3. Live inserts.
    this.channel = this.sb
      .channel(`group:${this.groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${this.groupId}` },
        (payload) => void this.deliver(payload.new as GroupMessageRow)
      )
      .subscribe();

    // 4. Polling safety net (deduped by id), mirrors the 1-on-1 transport.
    this.pollTimer = setInterval(() => void this.poll(), 3500);
  }

  private async poll() {
    const { data } = await this.sb
      .from("group_messages")
      .select("id, group_id, sender_id, recipients, created_at")
      .eq("group_id", this.groupId)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const row of ((data as GroupMessageRow[] | null) || []).reverse()) await this.deliver(row);
  }

  private async deliver(row: GroupMessageRow) {
    if (this.seen.has(row.id)) return;
    this.seen.add(row.id);
    const sender = this.members.get(row.sender_id);
    const entry = row.recipients?.[this.ctx.userId];
    if (!sender || !entry) return; // not addressed to us / unknown sender
    let text: string;
    try {
      text = await decryptFromSender(this.ctx.keyPair.privateKey, sender.publicKey, entry);
    } catch {
      return; // undecryptable (key drift) — skip rather than crash
    }
    this.events.onMessage(
      text,
      {
        id: row.id,
        ciphertext: entry.ciphertext,
        iv: entry.iv,
        ts: new Date(row.created_at).getTime(),
        senderName: sender.username,
      },
      row.sender_id === this.ctx.userId
    );
  }

  async send(text: string): Promise<WirePayload | null> {
    // Encrypt for every member INCLUDING ourselves, so all devices (and our own
    // history) can read it.
    const recipients: GroupMember[] = [...this.members.entries()].map(([id, v]) => ({
      id,
      publicKey: v.publicKey,
    }));
    const map = await encryptForRecipients(this.ctx.keyPair.privateKey, recipients, text);
    const { data, error } = await this.sb
      .from("group_messages")
      .insert({ group_id: this.groupId, sender_id: this.ctx.userId, recipients: map })
      .select("id, created_at")
      .single();
    if (error || !data) {
      this.events.onError?.(error?.message || "Failed to send");
      return null;
    }
    this.seen.add(data.id as string);
    const mine = map[this.ctx.userId];
    return {
      id: data.id as string,
      ciphertext: mine?.ciphertext || "",
      iv: mine?.iv || "",
      ts: new Date(data.created_at as string).getTime(),
      senderName: this.ctx.username,
    };
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.channel) void this.sb.removeChannel(this.channel);
    this.channel = null;
  }
}
