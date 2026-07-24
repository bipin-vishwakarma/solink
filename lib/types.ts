export interface ReplyRef {
  id: string;
  preview: string; // short quoted snippet of the original
  mine: boolean; // was the quoted message ours?
}

export interface ChatMessage {
  id: string;
  mine: boolean; // true if sent by this device
  text: string; // decrypted plaintext — lives only in memory
  ts: number;
  senderName: string;
  replyTo?: ReplyRef;
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

// Events a transport emits back to the UI.
export interface TransportEvents {
  onPeer: (name: string, simulated: boolean) => void;
  onMessage: (text: string, payload: WirePayload, mine: boolean) => void;
  onWireLog: (raw: string) => void; // the ciphertext that crosses the wire
  onError?: (message: string) => void;
  onTyping?: (isTyping: boolean) => void; // peer started/stopped typing
}

// Common shape implemented by both the local (demo) and Supabase (cloud) transports.
export interface ChatTransport {
  start: () => Promise<void>;
  send: (text: string) => Promise<WirePayload | null>;
  sendTyping?: (isTyping: boolean) => void;
  destroy: () => void;
}
