import { describe, expect, it, beforeEach } from "vitest";
import {
  BUILTIN_STICKER_PACKS,
  getCustomStickers,
  saveCustomSticker,
  removeCustomSticker,
  searchStickersAndGifs,
  type Sticker,
} from "../lib/stickers";
import { WECHAT_EMOJIS, searchWechatEmojis } from "../lib/wechatEmojis";
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

describe("WeChat expressions dataset & search", () => {
  it("includes official WeChat expressions", () => {
    expect(WECHAT_EMOJIS.length).toBeGreaterThanOrEqual(40);
    const doge = WECHAT_EMOJIS.find((e) => e.code === "[Doge]");
    expect(doge).toBeDefined();
    expect(doge?.char).toBe("🐶");
    const facepalm = WECHAT_EMOJIS.find((e) => e.code === "[Facepalm]");
    expect(facepalm).toBeDefined();
    expect(facepalm?.char).toBe("🤦");
  });

  it("filters WeChat expressions via searchWechatEmojis", () => {
    const results = searchWechatEmojis("doge");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].code).toBe("[Doge]");

    const emptySearch = searchWechatEmojis("");
    expect(emptySearch.length).toBe(WECHAT_EMOJIS.length);
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

  it("searches stickers and animated GIFs across names and tags", () => {
    const popcatResults = searchStickersAndGifs("popcat");
    expect(popcatResults.length).toBeGreaterThan(0);
    expect(popcatResults.some((s) => s.id === "gif-popcat")).toBe(true);

    const fireResults = searchStickersAndGifs("fire");
    expect(fireResults.length).toBeGreaterThan(0);

    const emptyResults = searchStickersAndGifs("");
    expect(emptyResults.length).toBeGreaterThan(10);
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
