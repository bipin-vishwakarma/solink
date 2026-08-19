import { describe, expect, it } from "vitest";
import {
  DEVICE_LIMIT,
  defaultDeviceName,
  forgetInstallationId,
  getOrCreateInstallationId,
  isDeviceLimitError,
} from "../lib/deviceRegistry";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("device registry policy", () => {
  it("limits each account to exactly five active devices", () => {
    expect(DEVICE_LIMIT).toBe(5);
  });

  it("persists one stable UUID for an installation", () => {
    const storage = new MemoryStorage();

    const first = getOrCreateInstallationId(storage);
    const second = getOrCreateInstallationId(storage);

    expect(second).toBe(first);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("creates independent IDs for independent browser installations", () => {
    expect(getOrCreateInstallationId(new MemoryStorage())).not.toBe(
      getOrCreateInstallationId(new MemoryStorage())
    );
  });

  it("scopes installation IDs when accounts share one browser", () => {
    const storage = new MemoryStorage();
    const firstAccount = getOrCreateInstallationId(storage, "account-a");
    const secondAccount = getOrCreateInstallationId(storage, "account-b");

    expect(secondAccount).not.toBe(firstAccount);
    expect(getOrCreateInstallationId(storage, "account-a")).toBe(firstAccount);
  });

  it("forgets only the removed account installation ID", () => {
    const storage = new MemoryStorage();
    const first = getOrCreateInstallationId(storage, "account-a");
    const second = getOrCreateInstallationId(storage, "account-b");

    forgetInstallationId("account-a", storage);

    expect(getOrCreateInstallationId(storage, "account-a")).not.toBe(first);
    expect(getOrCreateInstallationId(storage, "account-b")).toBe(second);
  });

  it.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36",
      "Chrome on computer",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1",
      "Safari on mobile",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36",
      "Chrome on mobile",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
      "Firefox on computer",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36 Edg/127.0",
      "Edge on computer",
    ],
    ["", "Browser on computer"],
  ])("derives a safe default name from %s", (userAgent, expected) => {
    expect(defaultDeviceName(userAgent)).toBe(expected);
  });

  it("recognizes the database/RPC error used when five devices are already active", () => {
    expect(
      isDeviceLimitError({
        code: "P0001",
        message: "DEVICE_LIMIT_REACHED",
        details: "An account can have at most 5 active devices.",
      })
    ).toBe(true);
    expect(isDeviceLimitError(new Error("DEVICE_LIMIT_REACHED"))).toBe(true);
  });

  it("does not turn unrelated database failures into limit errors", () => {
    expect(isDeviceLimitError({ code: "42501", message: "row-level security violation" })).toBe(
      false
    );
    expect(isDeviceLimitError(null)).toBe(false);
  });
});
