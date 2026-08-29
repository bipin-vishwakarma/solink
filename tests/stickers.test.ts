import { describe, expect, it, beforeEach } from "vitest";
import {
  BUILTIN_STICKER_PACKS,
  getCustomStickers,
  saveCustomSticker,
  removeCustomSticker,
  type Sticker,
} from "../lib/stickers";
import { EMOJI_CATEGORIES, ALL_EMOJIS } from "../lib/emojis";
import { encodeMessage, decodeMessage } from "../lib/envelope";
import type { AttachmentMeta } from "../lib/types";

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] || null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

if (typeof globalThis.localStorage === "undefined") {
  const mock = new LocalStorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    writable: true,
  });
}

describe("WeChat emojis dataset", () => {
  it("includes the WeChat Expressions category", () => {
    const wechatCat = EMOJI_CATEGORIES.find((c) => c.key === "wechat");
    expect(wechatCat).toBeDefined();
    expect(wechatCat?.name).toBe("WeChat Expressions");
    expect(wechatCat?.emojis).toContain("🐶"); // Doge
    expect(wechatCat?.emojis).toContain("🤦"); // Facepalm
    expect(wechatCat?.emojis).toContain("🤓"); // Smart
    expect(wechatCat?.emojis).toContain("🧧"); // Red packet
  });

  it("includes all WeChat emojis in the flat ALL_EMOJIS list", () => {
    expect(ALL_EMOJIS).toContain("🐶");
    expect(ALL_EMOJIS).toContain("🤦");
    expect(ALL_EMOJIS).toContain("🧧");
  });
});

describe("Sticker packs dataset & storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("provides built-in sticker packs with valid SVG data URLs", () => {
    expect(BUILTIN_STICKER_PACKS.length).toBeGreaterThanOrEqual(3);
    const dogePack = BUILTIN_STICKER_PACKS.find((p) => p.id === "doge");
    expect(dogePack).toBeDefined();
    expect(dogePack!.stickers.length).toBeGreaterThan(0);
    expect(dogePack!.stickers[0].dataUrl).toMatch(/^data:image\/svg\+xml/);
  });

  it("saves, retrieves, and removes custom stickers in localStorage", () => {
    expect(getCustomStickers()).toEqual([]);

    const sticker: Sticker = {
      id: "custom-1",
      name: "My Cat",
      dataUrl: "data:image/webp;base64,mock",
    };

    saveCustomSticker(sticker);
    expect(getCustomStickers()).toEqual([sticker]);

    removeCustomSticker("custom-1");
    expect(getCustomStickers()).toEqual([]);
  });

  it("caps custom stickers at 48 items to conserve storage", () => {
    for (let i = 0; i < 55; i++) {
      saveCustomSticker({
        id: `sticker-${i}`,
        name: `Sticker ${i}`,
        dataUrl: `data:image/webp;base64,mock-${i}`,
      });
    }

    const saved = getCustomStickers();
    expect(saved.length).toBe(48);
  });
});

describe("Sticker envelope compatibility", () => {
  it("safely round-trips sticker attachments in versioned envelope", () => {
    const stickerAttachment: AttachmentMeta = {
      name: "sticker-doge-classic.sticker.webp",
      mime: "image/webp",
      size: 1024,
      ref: { data: "base64payload" },
    };

    const encoded = encodeMessage("", undefined, stickerAttachment);
    const decoded = decodeMessage(encoded);

    expect(decoded.text).toBe("");
    expect(decoded.attachment).toEqual(stickerAttachment);
    expect(decoded.attachment?.name).toMatch(/^sticker-/);
  });
});
