// Cloud transport: real-time, persisted, end-to-end encrypted chat over Supabase.
//
// Implements the same ChatTransport interface as LocalTransport, so the UI (ChatShell)
// doesn't care which one it's using. The database only ever stores {ciphertext, iv}.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  importPublicKey,
  exportPublicKey,
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
  SendResult,
  TransportEvents,
  WirePayload,
} from "./types";
import type { Profile } from "./supabaseClient";
import {
  getOutboxRecord,
  isPermanentOutboxError,
  removeOutboxRecord,
  saveOutboxRecord,
  sendOutboxRecord,
  type EncryptedOutboxRecord,
} from "./encryptedOutbox";
import { loadAccountPresence } from "./accountPresence";

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
  private keyMismatchReported = false;
  private undecryptable = new Set<string>();
  private ownKeyVerified = false;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;

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

    // Establish that this installation owns the account key before allowing
    // any offline fallback to the last verified peer key.
    await this.verifyOwnPublishedKey();

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
          // Only the tab that optimistically inserted this exact id has seen it.
          // A sibling device uses the same account sender id and must still show it.
          if (this.seen.has(row.id)) return;
          void this.deliver(row, true);
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.from && payload.from !== this.ctx.userId) {
          this.events.onTyping?.(!!payload.isTyping);
        }
      })
      .subscribe();

    const refreshPresence = async () => {
      if (!this.peer) return;
      const snapshot = await loadAccountPresence(this.sb, this.peer.id);
      this.events.onPresence?.(
        snapshot.status === "online",
        snapshot.status === "offline" ? snapshot.lastSeen : undefined
      );
    };
    void refreshPresence();
    this.presenceTimer = setInterval(() => void refreshPresence(), 45_000);

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
      .subscribe();

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
    if (this.seen.has(row.id) || this.undecryptable.has(row.id)) return;
    const delivered = await this.emitRow(row, live);
    if (delivered) this.seen.add(row.id);
    else this.undecryptable.add(row.id);
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
      await this.deliver(row, true);
    }
  }

  /** Fetch the peer's current public key and derive the key used for new sends. */
  private async refreshPeerKey(): Promise<CryptoKey | null> {
    if (!this.peer) return null;
    const { data, error } = await this.sb
      .from("profiles")
      .select("public_key")
      .eq("id", this.peer.id)
      .maybeSingle();
    if (error || !data?.public_key) return null;
    try {
      const theirPub = await importPublicKey(data.public_key);
      this.sharedKey = await deriveSharedKey(this.ctx.keyPair.privateKey, theirPub);
      this.peer.public_key = data.public_key;
      return this.sharedKey;
    } catch {
      return null;
    }
  }

  /** Re-fetch the peer's current public key and re-derive the shared key. */
  private async reDeriveKey(): Promise<boolean> {
    return (await this.refreshPeerKey()) !== null;
  }

  /** Confirm that this installation owns the account's established key. */
  private async verifyOwnPublishedKey(): Promise<"current" | "mismatch" | "failed"> {
    try {
      const localPublicKey = await exportPublicKey(this.ctx.keyPair.publicKey);
      const { data, error } = await this.sb
        .from("profiles")
        .select("public_key")
        .eq("id", this.ctx.userId)
        .maybeSingle();
      if (error || !data?.public_key) return "failed";
      if (data.public_key === localPublicKey) {
        this.ownKeyVerified = true;
        return "current";
      }
      return "mismatch";
    } catch {
      return "failed";
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
          // A fresh browser must not reclaim the account by replacing its key.
          const ownKeyStatus = await this.verifyOwnPublishedKey();
          if (!this.keyMismatchReported) {
            this.keyMismatchReported = true;
            if (ownKeyStatus === "mismatch") {
              this.events.onError?.(
                "This device does not have your account's encryption key. Restore it before messaging."
              );
            } else {
              this.events.onWarning?.(
                "Some older messages used a previous encryption key and cannot be opened. New messaging still works."
              );
            }
          }
          return null;
        }
      }
      return null;
    }
  }

  private async emitRow(row: MessageRow, live: boolean): Promise<boolean> {
    if (!this.sharedKey) return false;
    const text = await this.decryptText(row);
    if (text === null) return false; // old message from a lost historical key
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
    return true;
  }

  async send(text: string, messageId = crypto.randomUUID()): Promise<SendResult> {
    if (!this.conversationId) return { state: "failed", id: messageId };
    const queued = await getOutboxRecord(messageId).catch(() => undefined);
    if (queued) return this.sendPreparedRecord(queued);
    // Never send under a fresh installation key that differs from the account's
    // established key. Doing so would break other sessions and old history.
    const ownKeyStatus = await this.verifyOwnPublishedKey();
    if (ownKeyStatus === "mismatch") {
      this.events.onError?.(
        "Restore this account's encryption key before sending from this device."
      );
      return { state: "failed", id: messageId };
    }
    if (ownKeyStatus === "failed" && !this.ownKeyVerified) {
      this.events.onError?.("Could not verify this device's encryption key. Try again.");
      return { state: "failed", id: messageId };
    }
    // A peer may have opened Solink in another browser since this chat started.
    // Always encrypt to the public key currently published for the recipient.
    const currentKey = await this.refreshPeerKey();
    const key = currentKey || (this.ownKeyVerified ? this.sharedKey : null);
    if (!key) {
      this.events.onError?.("Could not refresh your contact's encryption key. Try again.");
      return { state: "failed", id: messageId };
    }
    return this.prepareAndSend(text, key, messageId, true);
  }

  private async prepareAndSend(
    text: string,
    key: CryptoKey,
    messageId: string,
    allowQueue: boolean
  ): Promise<SendResult> {
    if (!this.conversationId) return { state: "failed", id: messageId };
    const enc = await encryptMessage(key, text);
    const record: EncryptedOutboxRecord = {
      id: messageId,
      accountId: this.ctx.userId,
      conversationId: this.conversationId,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
    };
    try {
      await saveOutboxRecord(record);
    } catch {
      this.events.onError?.("Could not safely queue this message. Try again.");
      return { state: "failed", id: messageId };
    }
    return this.sendPreparedRecord(record, allowQueue);
  }

  private async sendPreparedRecord(
    record: EncryptedOutboxRecord,
    allowQueue = true
  ): Promise<SendResult> {
    let response;
    try {
      response = await sendOutboxRecord(this.sb, record);
    } catch {
      if (allowQueue) return { state: "queued", id: record.id, ts: record.createdAt };
      await removeOutboxRecord(record.id).catch(() => {});
      return { state: "failed", id: record.id };
    }
    const { data, error } = response;

    if (error || !data) {
      if (isPermanentOutboxError(error) || !allowQueue) {
        await removeOutboxRecord(record.id).catch(() => {});
        this.events.onError?.("Message could not be sent.");
        return { state: "failed", id: record.id };
      }
      return { state: "queued", id: record.id, ts: record.createdAt };
    }
    const inserted = Array.isArray(data) ? data[0] : data;
    if (!inserted?.id || !inserted?.created_at) {
      return { state: "queued", id: record.id, ts: record.createdAt };
    }
    await removeOutboxRecord(record.id).catch(() => {});
    this.seen.add(inserted.id as string); // don't let polling re-deliver our own message
    this.msgIds.add(inserted.id as string);
    this.events.onWireLog(record.ciphertext);
    return { state: "sent", payload: {
      id: inserted.id as string,
      ciphertext: record.ciphertext,
      iv: record.iv,
      ts: new Date(inserted.created_at as string).getTime(),
      senderName: this.ctx.username,
    } };
  }

  async sendAttachment(
    bytes: ArrayBuffer,
    meta: { name: string; mime: string; size: number },
    caption: string
  ): Promise<{ payload: WirePayload; attachment: AttachmentMeta } | null> {
    if (!this.conversationId) return null;
    const ownKeyStatus = await this.verifyOwnPublishedKey();
    if (ownKeyStatus !== "current") {
      this.events.onError?.(
        ownKeyStatus === "mismatch"
          ? "Restore this account's encryption key before sending from this device."
          : "Could not verify this device's encryption key. Try again."
      );
      return null;
    }
    const currentKey = await this.refreshPeerKey();
    if (!currentKey) {
      this.events.onError?.("Could not refresh your contact's encryption key. Try again.");
      return null;
    }
    const encrypted = await encryptBytes(currentKey, bytes);
    const path = `${this.conversationId}/${crypto.randomUUID()}`;
    const { error } = await this.sb.storage
      .from(ATTACH_BUCKET)
      .upload(path, encrypted, { contentType: "application/octet-stream", upsert: false });
    if (error) {
      this.events.onError?.(error.message);
      return null;
    }
    const attachment: AttachmentMeta = { ...meta, ref: { path } };
    // Use the same key for the attachment bytes and the message envelope.
    const result = await this.prepareAndSend(
      encodeMessage(caption, undefined, attachment),
      currentKey,
      crypto.randomUUID(),
      false
    );
    if (result.state !== "sent") {
      // The encrypted object is otherwise orphaned when the message insert
      // fails. Cleanup is best-effort and never changes delivery semantics.
      await this.sb.storage.from(ATTACH_BUCKET).remove([path]);
      return null;
    }
    return { payload: result.payload, attachment };
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
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }
}
