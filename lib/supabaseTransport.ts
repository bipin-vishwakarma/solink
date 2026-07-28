// Cloud transport: real-time, persisted, end-to-end encrypted chat over Supabase.
//
// Implements the same ChatTransport interface as LocalTransport, so the UI (ChatShell)
// doesn't care which one it's using. The database only ever stores {ciphertext, iv}.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  importPublicKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  encryptBytes,
  decryptBytes,
} from "./crypto";
import { encodeMessage } from "./envelope";
import type {
  AttachmentMeta,
  AttachmentRef,
  ChatTransport,
  TransportEvents,
  WirePayload,
} from "./types";
import type { Profile } from "./supabaseClient";

const ATTACH_BUCKET = "attachments";
const HISTORY_PAGE = 40; // messages loaded per page (initial + each "load older")

export interface CloudContext {
  supabase: SupabaseClient;
  userId: string;
  username: string;
  keyPair: CryptoKeyPair;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  ciphertext: string;
  iv: string;
  created_at: string;
}

export class SupabaseTransport implements ChatTransport {
  private sb: SupabaseClient;
  private sharedKey: CryptoKey | null = null;
  private conversationId: string | null = null;
  private peer: Profile | null = null;
  private channel: ReturnType<SupabaseClient["channel"]> | null = null;
  private extrasChannel: ReturnType<SupabaseClient["channel"]> | null = null;
  private reactionsChannel: ReturnType<SupabaseClient["channel"]> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<string>(); // message ids already delivered to the UI
  private msgIds = new Set<string>(); // message ids in this conversation (for reaction filtering)
  private oldestCreatedAt: string | null = null; // paging cursor for "load older"
  private historyExhausted = false; // no more older messages to load

  constructor(
    private peerUsername: string,
    private events: TransportEvents,
    private ctx: CloudContext
  ) {
    this.sb = ctx.supabase;
  }

  async start() {
    // 1. Look up the peer's profile (case-insensitive exact match).
    const { data: peer, error: peerErr } = await this.sb
      .from("profiles")
      .select("id, username, public_key, avatar_url")
      .ilike("username", this.peerUsername)
      .maybeSingle();

    if (peerErr) {
      this.events.onError?.(peerErr.message);
      return;
    }
    if (!peer) {
      this.events.onError?.(`No user named @${this.peerUsername} yet`);
      return;
    }
    if (peer.id === this.ctx.userId) {
      this.events.onError?.("That's you 🙂");
      return;
    }
    this.peer = peer as Profile;

    // 2. Derive the shared AES key from my private key + their public key.
    const theirPub = await importPublicKey(this.peer.public_key);
    this.sharedKey = await deriveSharedKey(this.ctx.keyPair.privateKey, theirPub);

    // 3. Find or create the 1-on-1 conversation.
    const { data: convId, error: rpcErr } = await this.sb.rpc("get_or_create_dm", {
      other: this.peer.id,
    });
    if (rpcErr || !convId) {
      this.events.onError?.(rpcErr?.message || "Could not open conversation");
      return;
    }
    this.conversationId = convId as string;

    // 4. Load + decrypt the most recent page of history (older pages load on demand).
    const { data: history } = await this.sb
      .from("messages")
      .select("id, conversation_id, sender_id, ciphertext, iv, created_at")
      .eq("conversation_id", this.conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_PAGE);

    const initial = ((history as MessageRow[] | null) || []).reverse(); // back to chronological
    if (initial.length < HISTORY_PAGE) this.historyExhausted = true;
    if (initial.length) this.oldestCreatedAt = initial[0].created_at;
    for (const row of initial) {
      await this.deliver(row, /* live */ false);
    }

    // 5a. PRIMARY channel — live messages + typing ONLY. Kept minimal and isolated so
    //     nothing else can ever break message delivery (this is the known-good path).
    this.channel = this.sb
      .channel(`conv:${this.conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${this.conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (row.sender_id === this.ctx.userId) return; // we added our own optimistically
          void this.deliver(row, true);
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.from && payload.from !== this.ctx.userId) {
          this.events.onTyping?.(!!payload.isTyping);
        }
      })
      .subscribe();

    // 5b. SECONDARY channel — read receipts + presence. If this fails to subscribe
    //     (e.g. realtime not enabled for message_reads), messaging is UNAFFECTED.
    this.extrasChannel = this.sb
      .channel(`conv-extras:${this.conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reads" },
        (payload) => {
          const row = payload.new as { message_id: string; reader_id: string };
          if (row.reader_id !== this.ctx.userId) this.events.onRead?.([row.message_id]);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          // REPLICA IDENTITY FULL gives us the whole old row. Scope to this chat.
          const old = payload.old as { id?: string; conversation_id?: string };
          if (old?.id && old.conversation_id === this.conversationId) {
            this.seen.delete(old.id);
            this.msgIds.delete(old.id);
            this.events.onDeleted?.(old.id);
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        if (!this.extrasChannel) return;
        const state = this.extrasChannel.presenceState() as Record<string, Array<{ user?: string }>>;
        const online = Object.values(state).some((entries) =>
          entries.some((e) => e.user === this.peer?.id)
        );
        this.events.onPresence?.(online);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void this.extrasChannel?.track({ user: this.ctx.userId, at: Date.now() });
        }
      });

    // 5c. Polling safety net — guarantees delivery even if realtime ever hiccups.
    //     Deduped against realtime by message id, so it never double-shows.
    this.pollTimer = setInterval(() => void this.poll(), 3000);

    // 5d. Reactions — own channel (isolated from message delivery). Load existing +
    //     subscribe to live changes. RLS scopes reactions to our conversations; we
    //     further filter to messages we know are in THIS conversation.
    void this.loadReactions();
    this.reactionsChannel = this.sb
      .channel(`reactions:${this.conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reactions" },
        (payload) => {
          const newRow = payload.new as { message_id?: string; user_id?: string; emoji?: string };
          const oldRow = payload.old as { message_id?: string; user_id?: string };
          if (payload.eventType === "DELETE") {
            const mid = oldRow?.message_id;
            const uid = oldRow?.user_id;
            if (mid && uid && this.msgIds.has(mid) && uid !== this.ctx.userId) {
              this.events.onReaction?.(mid, uid, "", false);
            }
          } else {
            const mid = newRow?.message_id;
            const uid = newRow?.user_id;
            if (mid && uid && this.msgIds.has(mid) && uid !== this.ctx.userId) {
              this.events.onReaction?.(mid, uid, newRow.emoji || "", false);
            }
          }
        }
      )
      .subscribe();

    // 6. Ready.
    this.events.onPeer(this.peer.username, false, this.peer.avatar_url);
  }

  private async loadReactions() {
    const ids = Array.from(this.msgIds);
    if (!ids.length) return;
    const { data } = await this.sb
      .from("reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);
    for (const row of (data as Array<{ message_id: string; user_id: string; emoji: string }> | null) || []) {
      this.events.onReaction?.(row.message_id, row.user_id, row.emoji, row.user_id === this.ctx.userId);
    }
  }

  sendReaction(messageId: string, emoji: string) {
    // optimistic
    this.events.onReaction?.(messageId, this.ctx.userId, emoji, true);
    if (emoji) {
      void this.sb
        .from("reactions")
        .upsert({ message_id: messageId, user_id: this.ctx.userId, emoji }, { onConflict: "message_id,user_id" });
    } else {
      void this.sb.from("reactions").delete().eq("message_id", messageId).eq("user_id", this.ctx.userId);
    }
  }

  /** Deliver a row exactly once (dedup across realtime + polling + history). */
  private async deliver(row: MessageRow, live: boolean) {
    this.msgIds.add(row.id);
    if (this.seen.has(row.id)) return;
    this.seen.add(row.id);
    await this.emitRow(row, live);
  }

  /** Fetch recent messages and deliver any the realtime feed missed. */
  private async poll() {
    if (!this.conversationId) return;
    const { data } = await this.sb
      .from("messages")
      .select("id, conversation_id, sender_id, ciphertext, iv, created_at")
      .eq("conversation_id", this.conversationId)
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = ((data as MessageRow[] | null) || []).reverse();
    for (const row of rows) {
      if (row.sender_id === this.ctx.userId) {
        this.seen.add(row.id); // our own — already shown optimistically
        continue;
      }
      await this.deliver(row, true);
    }
  }

  /** Re-fetch the peer's current public key and re-derive the shared key. */
  private async reDeriveKey(): Promise<boolean> {
    if (!this.peer) return false;
    const { data } = await this.sb
      .from("profiles")
      .select("public_key")
      .eq("id", this.peer.id)
      .maybeSingle();
    if (!data?.public_key) return false;
    try {
      const theirPub = await importPublicKey(data.public_key);
      this.sharedKey = await deriveSharedKey(this.ctx.keyPair.privateKey, theirPub);
      this.peer.public_key = data.public_key;
      return true;
    } catch {
      return false;
    }
  }

  private async decryptText(row: MessageRow): Promise<string | null> {
    if (!this.sharedKey) return null;
    try {
      return await decryptMessage(this.sharedKey, { ciphertext: row.ciphertext, iv: row.iv });
    } catch {
      // Key may have rotated (peer cleared data / new device). Re-fetch their
      // current public key, re-derive, and try once more — self-heals key drift.
      if (await this.reDeriveKey()) {
        try {
          return await decryptMessage(this.sharedKey!, { ciphertext: row.ciphertext, iv: row.iv });
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private async emitRow(row: MessageRow, live: boolean) {
    if (!this.sharedKey) return;
    const text = await this.decryptText(row);
    if (text === null) return; // truly undecryptable (old message from a lost key)
    {
      const mine = row.sender_id === this.ctx.userId;
      if (live) this.events.onWireLog(row.ciphertext);
      this.events.onMessage(
        text,
        {
          id: row.id,
          ciphertext: row.ciphertext,
          iv: row.iv,
          ts: new Date(row.created_at).getTime(),
          senderName: mine ? this.ctx.username : this.peer?.username || "peer",
        },
        mine
      );
    }
  }

  async send(text: string): Promise<WirePayload | null> {
    if (!this.sharedKey || !this.conversationId) return null;
    const enc = await encryptMessage(this.sharedKey, text);

    const { data, error } = await this.sb
      .from("messages")
      .insert({
        conversation_id: this.conversationId,
        sender_id: this.ctx.userId,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
      })
      .select("id, created_at")
      .single();

    if (error || !data) {
      this.events.onError?.(error?.message || "Failed to send");
      return null;
    }
    this.seen.add(data.id as string); // don't let polling re-deliver our own message
    this.msgIds.add(data.id as string);
    this.events.onWireLog(enc.ciphertext);
    return {
      id: data.id as string,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      ts: new Date(data.created_at as string).getTime(),
      senderName: this.ctx.username,
    };
  }

  async sendAttachment(
    bytes: ArrayBuffer,
    meta: { name: string; mime: string; size: number },
    caption: string
  ): Promise<{ payload: WirePayload; attachment: AttachmentMeta } | null> {
    if (!this.sharedKey || !this.conversationId) return null;
    const encrypted = await encryptBytes(this.sharedKey, bytes);
    const path = `${this.conversationId}/${crypto.randomUUID()}`;
    const { error } = await this.sb.storage
      .from(ATTACH_BUCKET)
      .upload(path, encrypted, { contentType: "application/octet-stream", upsert: false });
    if (error) {
      this.events.onError?.(error.message);
      return null;
    }
    const attachment: AttachmentMeta = { ...meta, ref: { path } };
    const payload = await this.send(encodeMessage(caption, undefined, attachment));
    if (!payload) return null;
    return { payload, attachment };
  }

  async resolveAttachment(ref: AttachmentRef): Promise<Blob | null> {
    if (!this.sharedKey || !ref.path) return null;
    const { data, error } = await this.sb.storage.from(ATTACH_BUCKET).download(ref.path);
    if (error || !data) return null;
    const plain = await decryptBytes(this.sharedKey, await data.arrayBuffer());
    return new Blob([plain]);
  }

  sendTyping(isTyping: boolean) {
    if (!this.channel) return;
    void this.channel.send({
      type: "broadcast",
      event: "typing",
      payload: { from: this.ctx.userId, isTyping },
    });
  }

  /** Page in the next batch of older messages. Returns how many were delivered. */
  async loadOlder(): Promise<number> {
    if (!this.conversationId || this.historyExhausted || !this.oldestCreatedAt) return 0;
    const { data } = await this.sb
      .from("messages")
      .select("id, conversation_id, sender_id, ciphertext, iv, created_at")
      .eq("conversation_id", this.conversationId)
      .lt("created_at", this.oldestCreatedAt)
      .order("created_at", { ascending: false })
      .limit(HISTORY_PAGE);
    const rows = ((data as MessageRow[] | null) || []).reverse();
    if (rows.length < HISTORY_PAGE) this.historyExhausted = true;
    if (rows.length) this.oldestCreatedAt = rows[0].created_at;
    let delivered = 0;
    for (const row of rows) {
      if (this.seen.has(row.id)) continue;
      await this.deliver(row, /* live */ false);
      delivered++;
    }
    return delivered;
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    // RLS only lets a sender delete their own rows; the eq() makes that explicit.
    const { error } = await this.sb
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("sender_id", this.ctx.userId);
    if (error) {
      this.events.onError?.(error.message);
      return false;
    }
    this.seen.delete(messageId);
    this.msgIds.delete(messageId);
    return true;
  }

  markRead(ids: string[]) {
    if (!ids.length) return;
    void this.sb
      .from("message_reads")
      .upsert(
        ids.map((id) => ({ message_id: id, reader_id: this.ctx.userId })),
        { onConflict: "message_id,reader_id", ignoreDuplicates: true }
      );
  }

  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.channel) {
      void this.sb.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.extrasChannel) {
      void this.sb.removeChannel(this.extrasChannel);
      this.extrasChannel = null;
    }
    if (this.reactionsChannel) {
      void this.sb.removeChannel(this.reactionsChannel);
      this.reactionsChannel = null;
    }
  }
}
