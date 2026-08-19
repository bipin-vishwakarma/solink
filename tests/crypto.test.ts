import { describe, expect, it } from "vitest";
import {
  decryptBytes,
  decryptMessage,
  deriveSharedKey,
  encryptBytes,
  encryptMessage,
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
});
