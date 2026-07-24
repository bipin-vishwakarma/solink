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
      .select("id, username, public_key")
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

    // 4. Load + decrypt history.
    const { data: history } = await this.sb
      .from("messages")
      .select("id, conversation_id, sender_id, ciphertext, iv, created_at")
      .eq("conversation_id", this.conversationId)
      .order("created_at", { ascending: true });

    for (const row of (history as MessageRow[] | null) || []) {
      await this.emitRow(row, /* live */ false);
    }

    // 5. Subscribe to new messages in real time (+ ephemeral typing broadcasts).
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
          void this.emitRow(row, true);
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.from && payload.from !== this.ctx.userId) {
          this.events.onTyping?.(!!payload.isTyping);
        }
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reads" },
        (payload) => {
          const row = payload.new as { message_id: string; reader_id: string };
          // RLS already limits these to our conversations; ignore our own reads.
          if (row.reader_id !== this.ctx.userId) this.events.onRead?.([row.message_id]);
        }
      )
      .on("presence", { event: "sync" }, () => {
        if (!this.channel) return;
        const state = this.channel.presenceState() as Record<string, Array<{ user?: string }>>;
        const online = Object.values(state).some((entries) =>
          entries.some((e) => e.user === this.peer?.id)
        );
        this.events.onPresence?.(online);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void this.channel?.track({ user: this.ctx.userId, at: Date.now() });
        }
      });

    // 6. Ready.
    this.events.onPeer(this.peer.username, false);
  }

  private async emitRow(row: MessageRow, live: boolean) {
    if (!this.sharedKey) return;
    try {
      const text = await decryptMessage(this.sharedKey, { ciphertext: row.ciphertext, iv: row.iv });
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
    } catch {
      /* undecryptable (e.g. sent from another device with a different key) */
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
    if (this.channel) {
      void this.sb.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
