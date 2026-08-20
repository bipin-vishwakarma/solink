import type { SupabaseClient } from "@supabase/supabase-js";

const DB_NAME = "solink-outbox";
const STORE = "messages";
const DB_VERSION = 1;

export interface EncryptedOutboxRecord {
  id: string;
  accountId: string;
  conversationId: string;
  ciphertext: string;
  iv: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
}

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("accountId", "accountId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getOutboxRecord(id: string): Promise<EncryptedOutboxRecord | undefined> {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as EncryptedOutboxRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOutboxRecord(record: EncryptedOutboxRecord): Promise<void> {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeOutboxRecord(id: string): Promise<void> {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listAccountOutbox(accountId: string): Promise<EncryptedOutboxRecord[]> {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).index("accountId").getAll(accountId);
    request.onsuccess = () => resolve(request.result as EncryptedOutboxRecord[]);
    request.onerror = () => reject(request.error);
  });
}

export async function sendOutboxRecord(sb: SupabaseClient, record: EncryptedOutboxRecord) {
  return sb.rpc("send_message_once", {
    message_id: record.id,
    target_conversation: record.conversationId,
    encrypted_ciphertext: record.ciphertext,
    encrypted_iv: record.iv,
  });
}

export function isPermanentOutboxError(error: unknown): boolean {
  const value = error as { status?: number; code?: string } | null;
  return value?.status === 400 || value?.status === 401 || value?.status === 403 ||
    value?.code === "42501" || value?.code === "P0001" || value?.code === "23505";
}

export async function drainEncryptedOutbox(sb: SupabaseClient, accountId: string): Promise<void> {
  const records = await listAccountOutbox(accountId);
  for (const record of records) {
    if (record.nextAttemptAt > Date.now()) continue;
    try {
      const { data, error } = await sendOutboxRecord(sb, record);
      if (!error && data) {
        await removeOutboxRecord(record.id);
        continue;
      }
      if (isPermanentOutboxError(error)) {
        await removeOutboxRecord(record.id);
      } else {
        const attempts = record.attempts + 1;
        await saveOutboxRecord({
          ...record,
          attempts,
          nextAttemptAt: Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)),
        });
      }
    } catch {
      const attempts = record.attempts + 1;
      await saveOutboxRecord({
        ...record,
        attempts,
        nextAttemptAt: Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)),
      });
    }
  }
}
