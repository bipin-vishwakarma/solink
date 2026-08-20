export interface ReplyRef {
  id: string;
  preview: string; // short quoted snippet of the original
  mine: boolean; // was the quoted message ours?
}

// Where the encrypted attachment bytes live: a storage path (cloud) or inline base64 (demo).
export interface AttachmentRef {
  path?: string; // Supabase Storage object path (cloud)
  data?: string; // base64 of [iv|ciphertext] (demo mode, small files)
}

export interface AttachmentMeta {
  name: string;
  mime: string;
  size: number;
  ref: AttachmentRef;
}

export interface ChatMessage {
  id: string;
  mine: boolean; // true if sent by this device
  text: string; // decrypted plaintext — lives only in memory
  ts: number;
  senderName: string;
  replyTo?: ReplyRef;
  attachment?: AttachmentMeta;
  read?: boolean; // for our own messages: has the peer read it? (blue ticks)
  status?: "sending" | "failed"; // our own messages: delivery state (absent = sent)
}

// What actually travels over the wire — no plaintext, ever.
export interface WirePayload {
  id: string;
  ciphertext: string;
  iv: string;
  ts: number;
  senderName: string;
}

export interface PeerInfo {
  peerId: string;
  name: string;
  publicKey: string; // base64
}

// A new message arriving in ANY of the user's conversations (drives the live inbox:
// recent-on-top sorting, unread badges, and cross-chat notifications).
export interface InboxActivity {
  fromUsername: string;
  ts: number;
}

// Aggregated reactions for one message (for display).
export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

// Events a transport emits back to the UI.
export interface TransportEvents {
  onPeer: (name: string, simulated: boolean, avatarUrl?: string | null) => void;
  onMessage: (text: string, payload: WirePayload, mine: boolean) => void;
  onWireLog: (raw: string) => void; // the ciphertext that crosses the wire
  onError?: (message: string) => void;
  onWarning?: (message: string) => void; // nonfatal: messaging remains available
  onTyping?: (isTyping: boolean) => void; // peer started/stopped typing
  onRead?: (messageIds: string[]) => void; // peer has read these of OUR messages
  onPresence?: (online: boolean, lastSeen?: number) => void; // peer online/last-seen
  // a reaction was added/changed/removed. emoji "" means removed. reactorId keys the reactor.
  onReaction?: (messageId: string, reactorId: string, emoji: string, mine: boolean) => void;
  onDeleted?: (messageId: string) => void; // a message was unsent (by us on another device, or the peer)
}

// Common shape implemented by both the local (demo) and Supabase (cloud) transports.
export interface ChatTransport {
  start: () => Promise<void>;
  send: (text: string) => Promise<WirePayload | null>;
  sendTyping?: (isTyping: boolean) => void;
  sendAttachment?: (
    bytes: ArrayBuffer,
    meta: { name: string; mime: string; size: number },
    caption: string
  ) => Promise<{ payload: WirePayload; attachment: AttachmentMeta } | null>;
  resolveAttachment?: (ref: AttachmentRef) => Promise<Blob | null>;
  markRead?: (messageIds: string[]) => void; // tell the peer we've read these
  sendReaction?: (messageId: string, emoji: string) => void; // emoji "" removes ours
  deleteMessage?: (messageId: string) => Promise<boolean>; // unsend one of our own messages
  loadOlder?: () => Promise<number>; // page in older history; returns how many were loaded
  destroy: () => void;
}
