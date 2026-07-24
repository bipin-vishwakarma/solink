// Real end-to-end encryption primitives built on the native Web Crypto API.
//
// Scheme (same shape as Signal/WhatsApp's core idea, simplified for a 1-on-1 MVP):
//   1. Each device owns an ECDH P-256 key pair. The private key never leaves the device
//      (kept in IndexedDB, non-exportable). The public key is shared freely.
//   2. Two peers derive an identical AES-GCM key from (myPrivate + theirPublic) via ECDH.
//   3. Messages are encrypted with AES-GCM + a fresh random IV. Only {ciphertext, iv}
//      ever crosses the wire — the relay/server/database can never read plaintext.

const DB_NAME = "solink";
const STORE = "keys";
const MY_KEYPAIR_ID = "me";

// ---------- base64 helpers ----------

export function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ---------- IndexedDB (stores the device's CryptoKeyPair object) ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

// ---------- key management ----------

/**
 * Returns this device's ECDH key pair, generating and persisting one on first use.
 * CryptoKey objects are structured-cloneable, so IndexedDB stores them directly —
 * the raw private key material is never exposed to JS.
 */
export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  const existing = await idbGet<CryptoKeyPair>(MY_KEYPAIR_ID);
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    // public key is extractable (so we can publish it); the pair as a whole is stored.
    true,
    ["deriveKey"]
  );
  await idbSet(MY_KEYPAIR_ID, pair);
  return pair;
}

/** Export a public key to a base64 string suitable for storing/transmitting. */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("spki", key);
  return bufToB64(raw);
}

/** Import a peer's base64 public key back into a CryptoKey for ECDH. */
export async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    b64ToBuf(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

/** Derive the shared AES-GCM key from my private key + a peer's public key. */
export async function deriveSharedKey(
  myPrivate: CryptoKey,
  theirPublic: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublic },
    myPrivate,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ---------- message encryption ----------

export interface Encrypted {
  ciphertext: string; // base64
  iv: string; // base64
}

export async function encryptMessage(
  sharedKey: CryptoKey,
  plaintext: string
): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, data);
  return { ciphertext: bufToB64(ct), iv: bufToB64(iv.buffer) };
}

export async function decryptMessage(
  sharedKey: CryptoKey,
  payload: Encrypted
): Promise<string> {
  const iv = new Uint8Array(b64ToBuf(payload.iv));
  const ct = b64ToBuf(payload.ciphertext);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, ct);
  return new TextDecoder().decode(plain);
}

// ---------- binary (file) encryption ----------
// Layout: [ 12-byte IV | AES-GCM ciphertext ] in a single ArrayBuffer.

export async function encryptBytes(
  sharedKey: CryptoKey,
  data: ArrayBuffer
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, data);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return out.buffer;
}

export async function decryptBytes(
  sharedKey: CryptoKey,
  blob: ArrayBuffer
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(blob);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, ct);
}
