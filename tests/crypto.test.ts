import { describe, expect, it } from "vitest";
import {
  decryptBytes,
  decryptMessage,
  deriveSharedKey,
  encryptBytes,
  encryptMessage,
  encryptDeviceTransfer,
  decryptDeviceTransfer,
  exportPublicKey,
  encryptForRecipients,
  decryptFromSender,
} from "../lib/crypto";

async function createKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  ) as Promise<CryptoKeyPair>;
}

describe("browser message encryption", () => {
  it("lets two peers derive compatible keys and exchange text", async () => {
    const alice = await createKeyPair();
    const bob = await createKeyPair();
    const aliceKey = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const bobKey = await deriveSharedKey(bob.privateKey, alice.publicKey);

    const encrypted = await encryptMessage(aliceKey, "hello from alice");

    await expect(decryptMessage(bobKey, encrypted)).resolves.toBe("hello from alice");
  });

  it("uses a fresh IV when encrypting the same text twice", async () => {
    const alice = await createKeyPair();
    const bob = await createKeyPair();
    const key = await deriveSharedKey(alice.privateKey, bob.publicKey);

    const first = await encryptMessage(key, "same plaintext");
    const second = await encryptMessage(key, "same plaintext");

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects ciphertext encrypted for a different peer", async () => {
    const alice = await createKeyPair();
    const bob = await createKeyPair();
    const mallory = await createKeyPair();
    const bobKey = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const malloryKey = await deriveSharedKey(mallory.privateKey, alice.publicKey);
    const encrypted = await encryptMessage(bobKey, "private message");

    await expect(decryptMessage(malloryKey, encrypted)).rejects.toThrow();
  });

  it("round-trips encrypted attachment bytes", async () => {
    const alice = await createKeyPair();
    const bob = await createKeyPair();
    const aliceKey = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const bobKey = await deriveSharedKey(bob.privateKey, alice.publicKey);
    const original = new TextEncoder().encode("binary attachment contents");
    const originalBuffer = original.buffer.slice(
      original.byteOffset,
      original.byteOffset + original.byteLength
    );

    const encrypted = await encryptBytes(aliceKey, originalBuffer);
    const decrypted = await decryptBytes(bobKey, encrypted);

    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it("transfers an account key only to the approved candidate device", async () => {
    const account = await createKeyPair();
    const candidate = await createKeyPair();
    const stranger = await createKeyPair();
    const candidatePublicKey = await exportPublicKey(candidate.publicKey);
    const envelope = await encryptDeviceTransfer(
      account,
      candidatePublicKey,
      "account-a",
      "request-a",
      "confirmation-secret"
    );

    const restored = await decryptDeviceTransfer(
      envelope,
      candidate,
      "account-a",
      "request-a"
    );

    expect(await exportPublicKey(restored.keyPair.publicKey)).toBe(
      await exportPublicKey(account.publicKey)
    );
    expect(restored.confirmationToken).toBe("confirmation-secret");
    await expect(
      decryptDeviceTransfer(envelope, stranger, "account-a", "request-a")
    ).rejects.toThrow();
  });

  it("rejects a transfer replayed with different account or request binding", async () => {
    const account = await createKeyPair();
    const candidate = await createKeyPair();
    const envelope = await encryptDeviceTransfer(
      account,
      await exportPublicKey(candidate.publicKey),
      "account-a",
      "request-a",
      "confirmation-secret"
    );

    await expect(
      decryptDeviceTransfer(envelope, candidate, "account-b", "request-a")
    ).rejects.toThrow();
    await expect(
      decryptDeviceTransfer(envelope, candidate, "account-a", "request-b")
    ).rejects.toThrow();
  });

  it("pairwise-encrypts group messages so each member decrypts only their own entry", async () => {
    const alice = await createKeyPair();
    const bob = await createKeyPair();
    const charlie = await createKeyPair();

    const alicePub = await exportPublicKey(alice.publicKey);
    const bobPub = await exportPublicKey(bob.publicKey);
    const charliePub = await exportPublicKey(charlie.publicKey);

    const recipients = [
      { id: "alice-id", publicKey: alicePub },
      { id: "bob-id", publicKey: bobPub },
      { id: "charlie-id", publicKey: charliePub },
    ];

    const encryptedMap = await encryptForRecipients(
      alice.privateKey,
      recipients,
      "secret group message"
    );

    expect(encryptedMap["alice-id"]).toBeDefined();
    expect(encryptedMap["bob-id"]).toBeDefined();
    expect(encryptedMap["charlie-id"]).toBeDefined();

    // Bob decrypts with Bob's private key + Alice's public key
    const bobDecrypted = await decryptFromSender(
      bob.privateKey,
      alicePub,
      encryptedMap["bob-id"]
    );
    expect(bobDecrypted).toBe("secret group message");

    // Charlie decrypts with Charlie's private key + Alice's public key
    const charlieDecrypted = await decryptFromSender(
      charlie.privateKey,
      alicePub,
      encryptedMap["charlie-id"]
    );
    expect(charlieDecrypted).toBe("secret group message");

    // Alice decrypts her own message from history
    const aliceDecrypted = await decryptFromSender(
      alice.privateKey,
      alicePub,
      encryptedMap["alice-id"]
    );
    expect(aliceDecrypted).toBe("secret group message");

    // Eve cannot decrypt Bob's entry
    const eve = await createKeyPair();
    await expect(
      decryptFromSender(eve.privateKey, alicePub, encryptedMap["bob-id"])
    ).rejects.toThrow();
  });
});
