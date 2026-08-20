import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCloudInbox } from "../lib/cloudInbox";
import { deriveSharedKey, encryptMessage, exportPublicKey } from "../lib/crypto";
import { encodeMessage } from "../lib/envelope";

async function createKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  ) as Promise<CryptoKeyPair>;
}

describe("cloud inbox", () => {
  it("decrypts latest previews locally without returning plaintext from the RPC", async () => {
    const local = await createKeyPair();
    const peer = await createKeyPair();
    const shared = await deriveSharedKey(peer.privateKey, local.publicKey);
    const encrypted = await encryptMessage(shared, "latest private text");
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        conversation_id: "conversation-a", peer_id: "peer-a", peer_username: "alice",
        peer_avatar_url: null, peer_public_key: await exportPublicKey(peer.publicKey),
        message_id: "message-a", sender_id: "peer-a", ciphertext: encrypted.ciphertext,
        iv: encrypted.iv, message_created_at: "2026-08-20T12:00:00.000Z",
        unread_count: 3, archived_at: null, pinned_at: "2026-08-20T12:01:00Z", muted_until: null,
      }],
      error: null,
    });

    const result = await loadCloudInbox({ rpc } as unknown as SupabaseClient, local);

    expect(rpc).toHaveBeenCalledWith("list_dm_inbox_v2", { page_size: 1000 });
    expect(result[0]).toEqual(expect.objectContaining({
      username: "alice", lastText: "latest private text", unread: 3, pinned: true, archived: false,
    }));
  });

  it("uses attachment labels and isolates old-key preview failures", async () => {
    const local = await createKeyPair();
    const peer = await createKeyPair();
    const stalePeer = await createKeyPair();
    const shared = await deriveSharedKey(peer.privateKey, local.publicKey);
    const encrypted = await encryptMessage(
      shared,
      encodeMessage("", undefined, { name: "image.jpg", mime: "image/jpeg", size: 10, ref: { path: "encrypted" } })
    );
    const staleShared = await deriveSharedKey(stalePeer.privateKey, local.publicKey);
    const stale = await encryptMessage(staleShared, "unavailable old text");
    const rpc = vi.fn().mockResolvedValue({ data: [
      { conversation_id: "a", peer_id: "a", peer_username: "alice", peer_avatar_url: null,
        peer_public_key: await exportPublicKey(peer.publicKey), message_id: "m1", sender_id: "a",
        ciphertext: encrypted.ciphertext, iv: encrypted.iv, message_created_at: "2026-08-20T12:00:00Z",
        unread_count: 0, archived_at: null, pinned_at: null, muted_until: null },
      { conversation_id: "b", peer_id: "b", peer_username: "bob", peer_avatar_url: null,
        peer_public_key: await exportPublicKey(peer.publicKey), message_id: "m2", sender_id: "b",
        ciphertext: stale.ciphertext, iv: stale.iv, message_created_at: "2026-08-20T11:00:00Z",
        unread_count: 0, archived_at: null, pinned_at: null, muted_until: null },
    ], error: null });

    const result = await loadCloudInbox({ rpc } as unknown as SupabaseClient, local);

    expect(result.map((item) => item.lastText)).toEqual(["📷 Photo", "Older encrypted message unavailable"]);
  });
});
