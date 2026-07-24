// A tiny wire envelope so a single encrypted string can carry rich message data
// (text + optional reply reference + optional attachment) without any database schema
// change. The transports still just move an opaque string; only this module knows the
// structure. Backward compatible: anything that isn't our tagged JSON is plain text.

import type { AttachmentMeta, ReplyRef } from "./types";

interface Envelope {
  _sl: 1; // Solink envelope marker + version
  t: string;
  r?: ReplyRef;
  a?: AttachmentMeta;
}

export interface DecodedMessage {
  text: string;
  replyTo?: ReplyRef;
  attachment?: AttachmentMeta;
}

export function encodeMessage(
  text: string,
  replyTo?: ReplyRef,
  attachment?: AttachmentMeta
): string {
  if (!replyTo && !attachment) return text; // keep plain messages plain
  const env: Envelope = { _sl: 1, t: text, r: replyTo, a: attachment };
  return JSON.stringify(env);
}

export function decodeMessage(raw: string): DecodedMessage {
  if (raw.startsWith('{"_sl":1')) {
    try {
      const env = JSON.parse(raw) as Envelope;
      if (env && env._sl === 1 && typeof env.t === "string") {
        return { text: env.t, replyTo: env.r, attachment: env.a };
      }
    } catch {
      /* fall through to plain */
    }
  }
  return { text: raw };
}
