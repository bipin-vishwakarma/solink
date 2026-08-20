import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeMessage } from "./envelope";
import { decryptMessage, deriveSharedKey, importPublicKey } from "./crypto";

interface InboxRow {
  conversation_id: string;
  peer_id: string;
  peer_username: string;
  peer_avatar_url: string | null;
  peer_public_key: string;
  message_id: string | null;
  sender_id: string | null;
  ciphertext: string | null;
  iv: string | null;
  message_created_at: string | null;
}

export interface CloudInboxItem {
  conversationId: string;
  username: string;
  avatarUrl: string | null;
  lastText: string;
  lastActivity: number;
}

function previewText(raw: string): string {
  const message = decodeMessage(raw);
  if (message.text.trim()) return message.text.trim();
  if (!message.attachment) return "Encrypted message";
  if (message.attachment.mime.startsWith("image/")) return "📷 Photo";
  if (message.attachment.mime.startsWith("audio/")) return "🎤 Voice message";
  return `📎 ${message.attachment.name || "File"}`;
}

export async function loadCloudInbox(
  sb: SupabaseClient,
  keyPair: CryptoKeyPair
): Promise<CloudInboxItem[]> {
  const { data, error } = await sb.rpc("list_dm_inbox", { page_size: 50 });
  if (error) throw error;
  const items: CloudInboxItem[] = [];
  const seenPeers = new Set<string>();
  for (const row of ((data as InboxRow[] | null) || [])) {
    if (seenPeers.has(row.peer_id)) continue;
    seenPeers.add(row.peer_id);
    let lastText = row.message_id ? "Encrypted message" : "No messages yet";
    if (row.ciphertext && row.iv) {
      try {
        const peerPublicKey = await importPublicKey(row.peer_public_key);
        const sharedKey = await deriveSharedKey(keyPair.privateKey, peerPublicKey);
        lastText = previewText(
          await decryptMessage(sharedKey, { ciphertext: row.ciphertext, iv: row.iv })
        );
      } catch {
        lastText = "Older encrypted message unavailable";
      }
    }
    items.push({
      conversationId: row.conversation_id,
      username: row.peer_username,
      avatarUrl: row.peer_avatar_url,
      lastText,
      lastActivity: row.message_created_at ? new Date(row.message_created_at).getTime() : 0,
    });
  }
  return items;
}
