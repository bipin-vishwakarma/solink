"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { WECHAT_EMOJIS, type WechatEmoji } from "@/lib/wechatEmojis";
import {
  BUILTIN_STICKER_PACKS,
  getCustomStickers,
  saveCustomSticker,
  searchStickersAndGifs,
  type Sticker,
} from "@/lib/stickers";

export function WeChatDrawer({
  onPickEmoji,
  onPickSticker,
  onBackspace,
}: {
  onPickEmoji: (emoji: string) => void;
  onPickSticker?: (sticker: Sticker) => void;
  onBackspace?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"wechat" | "stickers">("wechat");
  const [activePackId, setActivePackId] = useState<string>("all");
  const [stickerQuery, setStickerQuery] = useState("");
  const [customStickers, setCustomStickers] = useState<Sticker[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  useEffect(() => {
    setCustomStickers(getCustomStickers());
  }, []);

  const handleAddCustomSticker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 240;
        let w = img.width;
        let h = img.height;
        if (w > h && w > max) {
          h = Math.round((h * max) / w);
          w = max;
        } else if (h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const optimizedDataUrl = canvas.toDataURL("image/webp", 0.9);
          const newSticker: Sticker = {
            id: `custom-${Date.now()}`,
            name: file.name.replace(/\.[^/.]+$/, ""),
            dataUrl: optimizedDataUrl,
            tags: ["custom", "favorite", file.name.toLowerCase()],
          };
          const updated = saveCustomSticker(newSticker);
          setCustomStickers(updated);
          setActivePackId("favorites");
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Filter stickers based on search query or active pack
  const displayedStickers = useMemo<Sticker[]>(() => {
    const trimmed = stickerQuery.trim();
    if (trimmed) {
      return searchStickersAndGifs(trimmed, customStickers);
    }
    if (activePackId === "favorites") {
      return customStickers;
    }
    if (activePackId === "all") {
      return [
        ...customStickers,
        ...BUILTIN_STICKER_PACKS.flatMap((p) => p.stickers),
      ];
    }
    const foundPack = BUILTIN_STICKER_PACKS.find((p) => p.id === activePackId);
    return foundPack?.stickers ?? [];
  }, [stickerQuery, activePackId, customStickers]);

  return (
    <div className="w-full h-[285px] sm:h-[300px] border-t border-brand-border bg-brand-surface/95 backdrop-blur flex flex-col select-none overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* Hidden file input for custom stickers */}
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAddCustomSticker}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "wechat" ? (
          /* WeChat Emojis Grid */
          <div className="h-full flex flex-col justify-between p-2 sm:p-3">
            <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-1">
              <div className="grid grid-cols-7 sm:grid-cols-8 gap-y-2 gap-x-1 sm:gap-2">
                {WECHAT_EMOJIS.map((emoji: WechatEmoji) => (
                  <button
                    key={emoji.code}
                    onClick={() => onPickEmoji(emoji.char)}
                    type="button"
                    title={`${emoji.code} ${emoji.name}`}
                    className="pressable flex aspect-square items-center justify-center rounded-xl text-2xl hover:bg-white/10 active:scale-95 transition"
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            </div>

            {/* WeChat Backspace key row */}
            {onBackspace && (
              <div className="flex items-center justify-between pt-1.5 px-1 border-t border-brand-border/40 text-xs text-brand-muted">
                <span className="text-[11px] font-medium opacity-75">WeChat Official Expressions</span>
                <button
                  onClick={onBackspace}
                  type="button"
                  title="Delete"
                  aria-label="Delete last character"
                  className="pressable flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1 text-sm font-semibold text-brand-text hover:bg-white/15 active:scale-95 transition"
                >
                  <span className="text-base leading-none">⌫</span>
                  <span className="text-xs">Del</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Stickers & GIFs Search + Grid */
          <div className="h-full flex flex-col">
            {/* Search Bar */}
            <div className="p-2 border-b border-brand-border/50 shrink-0">
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs text-brand-muted pointer-events-none">🔍</span>
                <input
                  type="text"
                  value={stickerQuery}
                  onChange={(e) => setStickerQuery(e.target.value)}
                  placeholder="Search stickers & GIFs (e.g. doge, cat, fire, fine)…"
                  className="w-full rounded-xl border border-brand-border bg-black/25 pl-8 pr-8 py-1.5 text-xs text-brand-text placeholder:text-brand-muted focus:border-brand-accent focus:outline-none"
                />
                {stickerQuery && (
                  <button
                    onClick={() => setStickerQuery("")}
                    type="button"
                    className="absolute right-2.5 text-xs text-brand-muted hover:text-brand-text"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Pack Filter Pills (when not actively searching) */}
            {!stickerQuery && (
              <div className="flex items-center gap-1 overflow-x-auto px-2 py-1 border-b border-brand-border/40 shrink-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <button
                  onClick={() => setActivePackId("all")}
                  type="button"
                  className={`pressable shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-medium transition ${
                    activePackId === "all"
                      ? "bg-brand-accent text-white"
                      : "bg-white/5 text-brand-muted hover:text-brand-text"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActivePackId("favorites")}
                  type="button"
                  className={`pressable shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-medium transition ${
                    activePackId === "favorites"
                      ? "bg-brand-accent text-white"
                      : "bg-white/5 text-brand-muted hover:text-brand-text"
                  }`}
                >
                  <span>⭐</span>
                  <span>Favorites ({customStickers.length})</span>
                </button>
                {BUILTIN_STICKER_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => setActivePackId(pack.id)}
                    type="button"
                    className={`pressable shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-medium transition ${
                      activePackId === pack.id
                        ? "bg-brand-accent text-white"
                        : "bg-white/5 text-brand-muted hover:text-brand-text"
                    }`}
                  >
                    <span>{pack.icon}</span>
                    <span>{pack.name}</span>
                  </button>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  className="pressable shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-brand-border bg-white/5 px-2 py-0.5 text-xs font-medium text-brand-muted hover:border-brand-accent hover:text-brand-accent transition"
                  title="Add custom sticker"
                >
                  <span>➕</span>
                  <span>Add</span>
                </button>
              </div>
            )}

            {/* Sticker Grid */}
            <div className="flex-1 overflow-y-auto p-2 overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {displayedStickers.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-brand-muted">
                  <span className="text-3xl">🔍</span>
                  <p>No stickers or GIFs found matching &quot;{stickerQuery}&quot;</p>
                  <button
                    onClick={() => setStickerQuery("")}
                    className="pressable rounded-full border border-brand-border bg-white/5 px-3 py-1 text-xs text-brand-text"
                    type="button"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {activePackId === "favorites" && !stickerQuery && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="pressable flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-brand-border bg-white/5 text-brand-muted hover:border-brand-accent hover:text-brand-accent transition"
                      title="Add custom sticker"
                      type="button"
                    >
                      <span className="text-xl leading-none">+</span>
                      <span className="mt-1 text-[10px] font-medium">Add</span>
                    </button>
                  )}
                  {displayedStickers.map((sticker) => (
                    <button
                      key={sticker.id}
                      onClick={() => onPickSticker?.(sticker)}
                      className="pressable group relative flex aspect-square items-center justify-center rounded-xl p-1.5 transition hover:scale-105 hover:bg-white/10 active:scale-95"
                      title={sticker.name}
                      type="button"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sticker.dataUrl}
                        alt={sticker.name}
                        className="h-full w-full object-contain pointer-events-none drop-shadow-sm"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Mode Switcher Bar: [ 😊 WeChat ] | [ 🏷️ Stickers & GIFs ] */}
      <div className="flex items-center justify-around border-t border-brand-border/70 bg-brand-surface2/90 px-3 py-1.5 shrink-0">
        <button
          onClick={() => setActiveTab("wechat")}
          type="button"
          className={`pressable flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
            activeTab === "wechat"
              ? "bg-brand-accent text-white shadow-sm"
              : "text-brand-muted hover:text-brand-text hover:bg-white/5"
          }`}
        >
          <span className="text-sm">😊</span>
          <span>WeChat</span>
        </button>
        <button
          onClick={() => setActiveTab("stickers")}
          type="button"
          className={`pressable flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
            activeTab === "stickers"
              ? "bg-brand-accent text-white shadow-sm"
              : "text-brand-muted hover:text-brand-text hover:bg-white/5"
          }`}
        >
          <span className="text-sm">🏷️</span>
          <span>Stickers &amp; GIFs</span>
        </button>
      </div>
    </div>
  );
}
