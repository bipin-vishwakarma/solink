import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backupKeyPair, exportPublicKey, getOrCreateKeyPair, restoreKeyPair } from "../lib/crypto";
import { classifyDeviceKey } from "../lib/deviceKeyState";

function installMemoryIndexedDb() {
  const records = new Map<IDBValidKey, unknown>();
  let opened = false;

  const database = {
    createObjectStore: vi.fn(),
    transaction: vi.fn(() => {
      const transaction: {
        oncomplete: (() => void) | null;
        onerror: (() => void) | null;
        error: DOMException | null;
        objectStore: () => {
          get: (key: IDBValidKey) => IDBRequest;
          put: (value: unknown, key: IDBValidKey) => IDBRequest;
        };
      } = {
        oncomplete: null,
        onerror: null,
        error: null,
        objectStore: () => ({
          get: (key) => {
            const request = { result: undefined, onsuccess: null, onerror: null } as unknown as {
              result: unknown;
              onsuccess: (() => void) | null;
              onerror: (() => void) | null;
            };
            queueMicrotask(() => {
              request.result = records.get(key);
              request.onsuccess?.();
            });
            return request as unknown as IDBRequest;
          },
          put: (value, key) => {
            records.set(key, value);
            queueMicrotask(() => transaction.oncomplete?.());
            return {} as IDBRequest;
          },
        }),
      };
      return transaction;
    }),
  };

  vi.stubGlobal("indexedDB", {
    open: vi.fn(() => {
      const request = {
        result: database,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      } as {
        result: typeof database;
        error: DOMException | null;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      };
      queueMicrotask(() => {
        if (!opened) {
          opened = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    }),
  });

  return records;
}

describe("multi-device key safety", () => {
  it("continues normally when the local and published keys match", () => {
    expect(classifyDeviceKey("same-public-key", "same-public-key", false)).toBe("matching");
    expect(classifyDeviceKey("same-public-key", "same-public-key", true)).toBe("matching");
  });

  it("requires recovery instead of overwriting a different published key", () => {
    expect(classifyDeviceKey("new-device-key", "established-account-key", true)).toBe(
      "recovery-required"
    );
  });

  it("reports unavailable history when keys differ and no recovery backup exists", () => {
    expect(classifyDeviceKey("new-device-key", "established-account-key", false)).toBe(
      "history-unavailable"
    );
  });
});

describe("key recovery persistence", () => {
  beforeEach(() => {
    installMemoryIndexedDb();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the original local key when recovery authentication fails", async () => {
    const original = await getOrCreateKeyPair();
    const originalPublicKey = await exportPublicKey(original.publicKey);
    const backupSecret = crypto.randomUUID();
    const wrongSecret = crypto.randomUUID();
    const backup = await backupKeyPair(original, backupSecret);

    await expect(restoreKeyPair(backup, wrongSecret)).rejects.toThrow();

    const stillStored = await getOrCreateKeyPair();
    expect(await exportPublicKey(stillStored.publicKey)).toBe(originalPublicKey);
  });
});
