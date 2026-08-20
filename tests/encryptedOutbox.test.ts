import { describe, expect, it } from "vitest";
import { isPermanentOutboxError, type EncryptedOutboxRecord } from "../lib/encryptedOutbox";

describe("encrypted outbox", () => {
  it("stores only encrypted delivery fields", () => {
    const record: EncryptedOutboxRecord = {
      id: "message-id",
      accountId: "account-id",
      conversationId: "conversation-id",
      ciphertext: "opaque-ciphertext",
      iv: "opaque-iv",
      createdAt: 1,
      attempts: 0,
      nextAttemptAt: 0,
    };
    expect(Object.keys(record).sort()).toEqual([
      "accountId", "attempts", "ciphertext", "conversationId", "createdAt",
      "id", "iv", "nextAttemptAt",
    ]);
    expect(JSON.stringify(record)).not.toContain("hello");
    expect(JSON.stringify(record)).not.toContain("filename");
  });

  it("separates permanent authorization failures from transient delivery failures", () => {
    expect(isPermanentOutboxError({ status: 403 })).toBe(true);
    expect(isPermanentOutboxError({ code: "42501" })).toBe(true);
    expect(isPermanentOutboxError({ status: 500 })).toBe(false);
    expect(isPermanentOutboxError(new TypeError("offline"))).toBe(false);
  });
});
