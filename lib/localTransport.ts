// Local, backend-free transport for Demo Mode.
//
// Pairs two browser tabs over a BroadcastChannel and relays ONLY encrypted payloads —
// so it demonstrates real end-to-end encryption with zero server. If no second tab shows
// up, it falls back to a simulated "echo" peer (its own key pair, in-tab) so a single tab
// can still exercise the full flow. Either way, the transport never sees plaintext.

import {
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  exportPublicKey,
  importPublicKey,
  getOrCreateKeyPair,
  encryptBytes,
  decryptBytes,
  bufToB64,
  b64ToBuf,
} from "./crypto";
import { encodeMessage } from "./envelope";
import type {
  AttachmentMeta,
  AttachmentRef,
  ChatTransport,
  TransportEvents,
  WirePayload,
} from "./types";

type Signal =
  | { kind: "hello"; peerId: string; name: string; publicKey: string }
  | { kind: "bye"; peerId: string }
  | { kind: "typing"; from: string; isTyping: boolean }
  | ({ kind: "msg"; from: string } & WirePayload);

const BOT_REPLIES = [
  "yeah that works for me",
  "lol ok",
  "wait fr?",
  "send it",
  "on my way",
  "bet",
  "give me 5 min",
  "haha nice",
  "did you finish it?",
  "let's do it tonight",
];

export class LocalTransport implements ChatTransport {
  private channel: BroadcastChannel;
  private myPeerId = crypto.randomUUID();
  private myName: string;
  private myKeyPair!: CryptoKeyPair;
  private myPublicB64 = "";

  private sharedKey: CryptoKey | null = null;
  private peerName = "";
  private simulated = false;

  // echo bot state (used only when no real peer appears)
  private botKeyPair: CryptoKeyPair | null = null;
  private botSharedKey: CryptoKey | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private room: string, private events: TransportEvents, name: string) {
    this.myName = name;
    this.channel = new BroadcastChannel(`solink:${room}`);
    this.channel.onmessage = (e) => this.handle(e.data as Signal);
  }

  async start() {
    this.myKeyPair = await getOrCreateKeyPair();
    this.myPublicB64 = await exportPublicKey(this.myKeyPair.publicKey);
    this.announce();
    // If nobody answers shortly, spin up a simulated peer so the demo still works solo.
    this.botTimer = setTimeout(() => {
      if (!this.sharedKey) this.enableEchoBot();
    }, 2500);
  }

  private announce() {
    this.post({
      kind: "hello",
      peerId: this.myPeerId,
      name: this.myName,
      publicKey: this.myPublicB64,
    });
  }

  private post(sig: Signal) {
    this.channel.postMessage(sig);
  }

  private async handle(sig: Signal) {
    if ("peerId" in sig && sig.peerId === this.myPeerId) return; // ignore self

    if (sig.kind === "hello") {
      // A real tab appeared — cancel the echo bot and pair for real.
      if (this.botTimer) clearTimeout(this.botTimer);
      if (this.simulated) return; // already talking to the bot; keep it simple
      const alreadyPaired = !!this.sharedKey;
      const theirPub = await importPublicKey(sig.publicKey);
      this.sharedKey = await deriveSharedKey(this.myKeyPair.privateKey, theirPub);
      this.peerName = sig.name;
      this.simulated = false;
      this.events.onPeer(this.peerName, false);
      // Reply so the peer that arrived first also learns about us.
      if (!alreadyPaired) this.announce();
      return;
    }

    if (sig.kind === "typing") {
      this.events.onTyping?.(sig.isTyping);
      return;
    }

    if (sig.kind === "msg") {
      if (!this.sharedKey) return;
      try {
        const text = await decryptMessage(this.sharedKey, sig);
        this.events.onWireLog(sig.ciphertext);
        this.events.onMessage(text, sig, false);
      } catch {
        /* not for us / wrong key */
      }
    }
  }

  sendTyping(isTyping: boolean) {
    if (this.simulated) {
      // Let the echo bot "type back" briefly for a lively demo.
      if (isTyping) {
        this.events.onTyping?.(true);
        setTimeout(() => this.events.onTyping?.(false), 1500);
      }
      return;
    }
    this.post({ kind: "typing", from: this.myPeerId, isTyping });
  }

  private async enableEchoBot() {
    this.simulated = true;
    // The "peer" is a second identity living in this tab.
    this.botKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"]
    );
    // Both directions of the shared key (they're identical, but derived from each side).
    this.sharedKey = await deriveSharedKey(this.myKeyPair.privateKey, this.botKeyPair.publicKey);
    this.botSharedKey = await deriveSharedKey(this.botKeyPair.privateKey, this.myKeyPair.publicKey);
    this.peerName = "Echo";
    this.events.onPeer(this.peerName, true);
  }

  async send(text: string): Promise<WirePayload | null> {
    if (!this.sharedKey) return null;
    const enc = await encryptMessage(this.sharedKey, text);
    const payload: WirePayload = {
      id: crypto.randomUUID(),
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      ts: Date.now(),
      senderName: this.myName,
    };
    this.events.onWireLog(payload.ciphertext);

    if (this.simulated) {
      // Bot "receives" (proving decryption works) then replies after a beat.
      this.scheduleBotReply();
    } else {
      this.post({ kind: "msg", from: this.myPeerId, ...payload });
    }
    return payload;
  }

  async sendAttachment(
    bytes: ArrayBuffer,
    meta: { name: string; mime: string; size: number },
    caption: string
  ): Promise<{ payload: WirePayload; attachment: AttachmentMeta } | null> {
    if (!this.sharedKey) return null;
    const encrypted = await encryptBytes(this.sharedKey, bytes);
    const attachment: AttachmentMeta = { ...meta, ref: { data: bufToB64(encrypted) } };
    const payload = await this.send(encodeMessage(caption, undefined, attachment));
    if (!payload) return null;
    return { payload, attachment };
  }

  async resolveAttachment(ref: AttachmentRef): Promise<Blob | null> {
    if (!this.sharedKey || !ref.data) return null;
    const plain = await decryptBytes(this.sharedKey, b64ToBuf(ref.data));
    return new Blob([plain]);
  }

  private scheduleBotReply() {
    if (!this.botSharedKey) return;
    const delay = 700 + Math.floor(Math.random() * 900);
    // Show a typing bubble while the "peer" composes.
    setTimeout(() => this.events.onTyping?.(true), 250);
    setTimeout(async () => {
      if (!this.botSharedKey) return;
      this.events.onTyping?.(false);
      const reply = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)];
      const enc = await encryptMessage(this.botSharedKey, reply);
      const payload: WirePayload = {
        id: crypto.randomUUID(),
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        ts: Date.now(),
        senderName: "Echo",
      };
      this.events.onWireLog(payload.ciphertext);
      // We decrypt with our side of the shared key — end to end, in-tab.
      const text = await decryptMessage(this.sharedKey!, enc);
      this.events.onMessage(text, payload, false);
    }, delay);
  }

  destroy() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.post({ kind: "bye", peerId: this.myPeerId });
    this.channel.close();
  }
}
