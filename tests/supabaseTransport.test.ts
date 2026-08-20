import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
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
  it("delivers a message only once when history and realtime overlap", async () => {
    const localKeyPair = await createKeyPair();
    const peerKeyPair = await createKeyPair();
    const localPublicKey = await exportPublicKey(localKeyPair.publicKey);
    const peerPublicKey = await exportPublicKey(peerKeyPair.publicKey);
    const sharedKey = await deriveSharedKey(peerKeyPair.privateKey, localKeyPair.publicKey);
    const encrypted = await encryptMessage(sharedKey, "one delivery only");
    const row = {
      id: "overlap-message",
      conversation_id: "conversation-id",
      sender_id: "peer-user",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      created_at: new Date().toISOString(),
    };
    let realtimeInsert: ((payload: { new: typeof row }) => void) | undefined;

    const fakeChannel = {
      on(
        type: string,
        filter: { event?: string; table?: string },
        callback: (payload: { new: typeof row }) => void
      ) {
        if (
          type === "postgres_changes" &&
          filter.event === "INSERT" &&
          filter.table === "messages"
        ) {
          realtimeInsert = callback;
        }
        return this;
      },
      subscribe() { return this; },
      send: vi.fn(),
      track: vi.fn(),
      presenceState() { return {}; },
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
                      return {
                        data: {
                          id: "peer-user",
                          username: "peer",
                          public_key: peerPublicKey,
                          avatar_url: null,
                        },
                        error: null,
                      };
                    },
                  };
                },
                eq(...args: unknown[]) {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          public_key: String(args[1]) === "local-user"
                            ? localPublicKey
                            : peerPublicKey,
                        },
                        error: null,
                      };
                    },
                  };
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
                      return { async limit() { return { data: [row] }; } };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "reactions") {
          return { select() { return { async in() { return { data: [] }; } }; } };
        }
        throw new Error("Unexpected table: " + table);
      },
      async rpc() { return { data: "conversation-id", error: null }; },
      channel() { return fakeChannel; },
      async removeChannel() { return "ok"; },
    } as unknown as SupabaseClient;
    const events: TransportEvents = {
      onPeer: vi.fn(),
      onMessage: vi.fn(),
      onWireLog: vi.fn(),
      onError: vi.fn(),
    };
    const transport = new SupabaseTransport("peer", events, {
      supabase: fakeSupabase,
      userId: "local-user",
      username: "local",
      keyPair: localKeyPair,
    });

    await transport.start();
    expect(realtimeInsert).toBeTypeOf("function");
    realtimeInsert!({ new: row });
    await vi.waitFor(() => expect(events.onMessage).toHaveBeenCalledTimes(1));
    transport.destroy();

    expect(events.onMessage).toHaveBeenCalledWith(
      "one delivery only",
      expect.objectContaining({ id: "overlap-message" }),
      false
    );
    expect(events.onError).not.toHaveBeenCalled();
  });

  it("delivers an unseen same-account message from a sibling device", async () => {
    const localKeyPair = await createKeyPair();
    const peerKeyPair = await createKeyPair();
    const localPublicKey = await exportPublicKey(localKeyPair.publicKey);
    const peerPublicKey = await exportPublicKey(peerKeyPair.publicKey);
    const sharedKey = await deriveSharedKey(localKeyPair.privateKey, peerKeyPair.publicKey);
    const encrypted = await encryptMessage(sharedKey, "sent from my phone");
    const row = {
      id: "sibling-device-message",
      conversation_id: "conversation-id",
      sender_id: "local-user",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      created_at: new Date().toISOString(),
    };
    let realtimeInsert: ((payload: { new: typeof row }) => void) | undefined;
    const fakeChannel = {
      on(type: string, filter: { event?: string; table?: string }, callback: (payload: { new: typeof row }) => void) {
        if (type === "postgres_changes" && filter.event === "INSERT" && filter.table === "messages") realtimeInsert = callback;
        return this;
      },
      subscribe() { return this; }, send: vi.fn(), track: vi.fn(), presenceState() { return {}; },
    };
    const fakeSupabase = {
      from(table: string) {
        if (table === "profiles") return { select() { return {
          ilike() { return { async maybeSingle() { return { data: { id: "peer-user", username: "peer", public_key: peerPublicKey }, error: null }; } }; },
          eq(...args: unknown[]) { return { async maybeSingle() { return { data: { public_key: String(args[1]) === "local-user" ? localPublicKey : peerPublicKey }, error: null }; } }; },
        }; } };
        if (table === "messages") return { select() { return { eq() { return { order() { return { async limit() { return { data: [] }; } }; } }; } }; } };
        if (table === "reactions") return { select() { return { async in() { return { data: [] }; } }; } };
        throw new Error("Unexpected table: " + table);
      },
      async rpc() { return { data: "conversation-id", error: null }; },
      channel() { return fakeChannel; }, async removeChannel() { return "ok"; },
    } as unknown as SupabaseClient;
    const events: TransportEvents = { onPeer: vi.fn(), onMessage: vi.fn(), onWireLog: vi.fn(), onError: vi.fn() };
    const transport = new SupabaseTransport("peer", events, { supabase: fakeSupabase, userId: "local-user", username: "local", keyPair: localKeyPair });

    await transport.start();
    realtimeInsert!({ new: row });
    await vi.waitFor(() => expect(events.onMessage).toHaveBeenCalledWith(
      "sent from my phone", expect.objectContaining({ id: row.id }), true
    ));
    transport.destroy();
  });

  it("treats an old-key history row as nonfatal", async () => {
    const localKeyPair = await createKeyPair();
    const peerKeyPair = await createKeyPair();
    const oldPeerKeyPair = await createKeyPair();
    const localPublicKey = await exportPublicKey(localKeyPair.publicKey);
    const peerPublicKey = await exportPublicKey(peerKeyPair.publicKey);
    const oldSharedKey = await deriveSharedKey(localKeyPair.privateKey, oldPeerKeyPair.publicKey);
    const encrypted = await encryptMessage(oldSharedKey, "old epoch");
    const row = { id: "old-key-message", conversation_id: "conversation-id", sender_id: "peer-user", ciphertext: encrypted.ciphertext, iv: encrypted.iv, created_at: new Date().toISOString() };
    const fakeChannel = { on() { return this; }, subscribe() { return this; }, send: vi.fn(), track: vi.fn(), presenceState() { return {}; } };
    const fakeSupabase = {
      from(table: string) {
        if (table === "profiles") return { select() { return {
          ilike() { return { async maybeSingle() { return { data: { id: "peer-user", username: "peer", public_key: peerPublicKey }, error: null }; } }; },
          eq(...args: unknown[]) { return { async maybeSingle() { return { data: { public_key: String(args[1]) === "local-user" ? localPublicKey : peerPublicKey }, error: null }; } }; },
        }; } };
        if (table === "messages") return { select() { return { eq() { return { order() { return { async limit() { return { data: [row] }; } }; } }; } }; } };
        if (table === "reactions") return { select() { return { async in() { return { data: [] }; } }; } };
        throw new Error("Unexpected table: " + table);
      },
      async rpc() { return { data: "conversation-id", error: null }; }, channel() { return fakeChannel; }, async removeChannel() { return "ok"; },
    } as unknown as SupabaseClient;
    const events: TransportEvents = { onPeer: vi.fn(), onMessage: vi.fn(), onWireLog: vi.fn(), onError: vi.fn(), onWarning: vi.fn() };
    const transport = new SupabaseTransport("peer", events, { supabase: fakeSupabase, userId: "local-user", username: "local", keyPair: localKeyPair });

    await transport.start();
    transport.destroy();

    expect(events.onMessage).not.toHaveBeenCalled();
    expect(events.onError).not.toHaveBeenCalled();
    expect(events.onWarning).toHaveBeenCalledWith(expect.stringContaining("older messages"));
  });

  it("refreshes a rotated recipient key immediately before sending", async () => {
    const senderKeyPair = await createKeyPair();
    const staleRecipientKeyPair = await createKeyPair();
    const currentRecipientKeyPair = await createKeyPair();
    const senderPublicKey = await exportPublicKey(senderKeyPair.publicKey);
    const staleRecipientPublicKey = await exportPublicKey(staleRecipientKeyPair.publicKey);
    const currentRecipientPublicKey = await exportPublicKey(currentRecipientKeyPair.publicKey);

    let publishedRecipientKey = staleRecipientPublicKey;
    let publishedSenderKey = senderPublicKey;
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

  it("refuses to send instead of overwriting a mismatched sender key", async () => {
    const senderKeyPair = await createKeyPair();
    const publishedSenderKeyPair = await createKeyPair();
    const recipientKeyPair = await createKeyPair();
    const publishedSenderKey = await exportPublicKey(publishedSenderKeyPair.publicKey);
    const recipientPublicKey = await exportPublicKey(recipientKeyPair.publicKey);
    const update = vi.fn();
    const insert = vi.fn();

    const fakeChannel = {
      on() { return this; },
      subscribe() { return this; },
      send: vi.fn(),
      track: vi.fn(),
      presenceState() { return {}; },
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
                      return {
                        data: { id: "peer-user", username: "peer", public_key: recipientPublicKey },
                        error: null,
                      };
                    },
                  };
                },
                eq(...args: unknown[]) {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          public_key: String(args[1]) === "sender-user"
                            ? publishedSenderKey
                            : recipientPublicKey,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
            update,
          };
        }
        if (table === "messages") {
          return {
            select() {
              return {
                eq() {
                  return { order() { return { async limit() { return { data: [] }; } }; } };
                },
              };
            },
            insert,
          };
        }
        if (table === "reactions") {
          return { select() { return { async in() { return { data: [] }; } }; } };
        }
        throw new Error("Unexpected table: " + table);
      },
      async rpc() { return { data: "conversation-id", error: null }; },
      channel() { return fakeChannel; },
      async removeChannel() { return "ok"; },
    } as unknown as SupabaseClient;
    const events: TransportEvents = {
      onPeer: vi.fn(),
      onMessage: vi.fn(),
      onWireLog: vi.fn(),
      onError: vi.fn(),
    };
    const transport = new SupabaseTransport("peer", events, {
      supabase: fakeSupabase,
      userId: "sender-user",
      username: "sender",
      keyPair: senderKeyPair,
    });

    await transport.start();
    const sent = await transport.send("must not be encrypted with the wrong key");
    transport.destroy();

    expect(sent).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(events.onError).toHaveBeenCalledWith(
      "Restore this account's encryption key before sending from this device."
    );
  });

  it("removes an uploaded encrypted attachment when its message insert fails", async () => {
    const senderKeyPair = await createKeyPair();
    const recipientKeyPair = await createKeyPair();
    const senderPublicKey = await exportPublicKey(senderKeyPair.publicKey);
    const recipientPublicKey = await exportPublicKey(recipientKeyPair.publicKey);
    const remove = vi.fn().mockResolvedValue({ error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });

    const fakeChannel = {
      on() { return this; },
      subscribe() { return this; },
      send: vi.fn(),
      track: vi.fn(),
      presenceState() { return {}; },
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
                      return {
                        data: { id: "peer-user", username: "peer", public_key: recipientPublicKey },
                        error: null,
                      };
                    },
                  };
                },
                eq(...args: unknown[]) {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          public_key: String(args[1]) === "sender-user"
                            ? senderPublicKey
                            : recipientPublicKey,
                        },
                        error: null,
                      };
                    },
                  };
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
                  return { order() { return { async limit() { return { data: [] }; } }; } };
                },
              };
            },
            insert() {
              return { select() { return { async single() {
                return { data: null, error: { message: "insert failed" } };
              } }; } };
            },
          };
        }
        if (table === "reactions") {
          return { select() { return { async in() { return { data: [] }; } }; } };
        }
        throw new Error("Unexpected table: " + table);
      },
      storage: {
        from() { return { upload, remove }; },
      },
      async rpc() { return { data: "conversation-id", error: null }; },
      channel() { return fakeChannel; },
      async removeChannel() { return "ok"; },
    } as unknown as SupabaseClient;
    const events: TransportEvents = {
      onPeer: vi.fn(),
      onMessage: vi.fn(),
      onWireLog: vi.fn(),
      onError: vi.fn(),
    };
    const transport = new SupabaseTransport("peer", events, {
      supabase: fakeSupabase,
      userId: "sender-user",
      username: "sender",
      keyPair: senderKeyPair,
    });

    await transport.start();
    const result = await transport.sendAttachment(
      new TextEncoder().encode("attachment").buffer,
      { name: "note.txt", mime: "text/plain", size: 10 },
      ""
    );
    transport.destroy();

    expect(result).toBeNull();
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0][0]).toHaveLength(1);
  });
});
