import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  decryptMessage,
  deriveSharedKey,
  exportPublicKey,
} from "../lib/crypto";
import { SupabaseTransport, type CloudContext } from "../lib/supabaseTransport";
import type { TransportEvents } from "../lib/types";

async function createKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  ) as Promise<CryptoKeyPair>;
}

describe("SupabaseTransport", () => {
  it("refreshes a rotated recipient key immediately before sending", async () => {
    const senderKeyPair = await createKeyPair();
    const staleSenderKeyPair = await createKeyPair();
    const staleRecipientKeyPair = await createKeyPair();
    const currentRecipientKeyPair = await createKeyPair();
    const senderPublicKey = await exportPublicKey(senderKeyPair.publicKey);
    const staleSenderPublicKey = await exportPublicKey(staleSenderKeyPair.publicKey);
    const staleRecipientPublicKey = await exportPublicKey(staleRecipientKeyPair.publicKey);
    const currentRecipientPublicKey = await exportPublicKey(currentRecipientKeyPair.publicKey);

    let publishedRecipientKey = staleRecipientPublicKey;
    let publishedSenderKey = staleSenderPublicKey;
    let profileLookupCount = 0;
    let insertedRow: { ciphertext: string; iv: string } | null = null;

    const fakeChannel = {
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
      send: vi.fn().mockResolvedValue(undefined),
      track: vi.fn().mockResolvedValue(undefined),
      presenceState() {
        return {};
      },
    };

    const fakeSupabase = {
      from(table: string) {
        if (table === "profiles") {
          return {
            select() {
              return {
                ilike() {
                  return {
                    async maybeSingle() {
                      profileLookupCount++;
                      return {
                        data: {
                          id: "peer-user",
                          username: "peer",
                          public_key: publishedRecipientKey,
                          avatar_url: null,
                        },
                        error: null,
                      };
                    },
                  };
                },
                eq(...args: unknown[]) {
                  const profileId = String(args[1]);
                  return {
                    async maybeSingle() {
                      profileLookupCount++;
                      return {
                        data: {
                          public_key:
                            profileId === "sender-user"
                              ? publishedSenderKey
                              : publishedRecipientKey,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
            update(values: unknown) {
              return {
                async eq(...args: unknown[]) {
                  const profileId = String(args[1]);
                  if (profileId === "sender-user") {
                    publishedSenderKey = (values as { public_key: string }).public_key;
                  }
                  return { error: null };
                },
              };
            },
          };
        }

        if (table === "messages") {
          return {
            select() {
              return {
                eq() {
                  return {
                    order() {
                      return {
                        async limit() {
                          return { data: [] };
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(row: unknown) {
              insertedRow = row as { ciphertext: string; iv: string };
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: { id: "message-id", created_at: new Date().toISOString() },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === "reactions") {
          return {
            select() {
              return {
                async in() {
                  return { data: [] };
                },
              };
            },
          };
        }

        throw new Error("Unexpected table: " + table);
      },
      async rpc() {
        return { data: "conversation-id", error: null };
      },
      channel() {
        return fakeChannel;
      },
      async removeChannel() {
        return "ok";
      },
    } as unknown as SupabaseClient;

    const events: TransportEvents = {
      onPeer: vi.fn(),
      onMessage: vi.fn(),
      onWireLog: vi.fn(),
      onError: vi.fn(),
    };
    const context: CloudContext = {
      supabase: fakeSupabase,
      userId: "sender-user",
      username: "sender",
      keyPair: senderKeyPair,
    };
    const transport = new SupabaseTransport("peer", events, context);

    await transport.start();
    publishedRecipientKey = currentRecipientPublicKey;
    const sent = await transport.send("rotated-key-message");
    transport.destroy();

    expect(sent).not.toBeNull();
    expect(profileLookupCount).toBeGreaterThanOrEqual(3);
    expect(publishedSenderKey).toBe(senderPublicKey);
    expect(insertedRow).not.toBeNull();

    const currentSharedKey = await deriveSharedKey(
      currentRecipientKeyPair.privateKey,
      senderKeyPair.publicKey
    );
    await expect(
      decryptMessage(currentSharedKey, {
        ciphertext: insertedRow!.ciphertext,
        iv: insertedRow!.iv,
      })
    ).resolves.toBe("rotated-key-message");

    const staleSharedKey = await deriveSharedKey(
      staleRecipientKeyPair.privateKey,
      senderKeyPair.publicKey
    );
    await expect(
      decryptMessage(staleSharedKey, {
        ciphertext: insertedRow!.ciphertext,
        iv: insertedRow!.iv,
      })
    ).rejects.toThrow();
  });
});
