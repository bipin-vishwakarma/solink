"use client";

import { useMemo, useRef, useState } from "react";
import { EMOJI_CATEGORIES, ALL_EMOJIS } from "@/lib/emojis";
import { StickerPicker } from "./StickerPicker";
import type { Sticker } from "@/lib/stickers";

export function EmojiPicker({
  onPick,
  onPickSticker,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onPickSticker?: (sticker: Sticker) => void;
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<"emoji" | "stickers">("emoji");
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string>(
    EMOJI_CATEGORIES[0]?.key ?? ""
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const trimmed = query.trim().toLowerCase();

  // When searching, show emojis from categories whose name matches the query.
  // Fall back to the full deduped list if nothing matches, so the grid is
  // never empty while typing.
  const searchResults = useMemo<string[]>(() => {
    if (!trimmed) return [];
    const matched = EMOJI_CATEGORIES.filter((c) =>
      c.name.toLowerCase().includes(trimmed) || c.key.toLowerCase().includes(trimmed)
    ).flatMap((c) => c.emojis);
    return matched.length > 0 ? matched : ALL_EMOJIS;
  }, [trimmed]);

  const isSearching = trimmed.length > 0;

  const scrollToCategory = (key: string) => {
    setActiveKey(key);
    const el = sectionRefs.current[key];
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - container.offsetTop, behavior: "smooth" });
    }
  };

  return (
    <div className="w-[22rem] max-w-[92vw] overflow-hidden rounded-2xl border border-brand-border bg-brand-surface2 text-brand-text shadow-2xl backdrop-blur">
      {/* Top Mode Tabs: Emoji / Stickers */}
      <div className="flex items-center justify-between border-b border-brand-border/60 px-3 pt-2 pb-2">
        <div className="flex items-center gap-1 rounded-xl bg-black/25 p-0.5">
          <button
            type="button"
            onClick={() => setMode("emoji")}
            className={`pressable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              mode === "emoji"
                ? "bg-brand-accent text-white shadow-sm"
                : "text-brand-muted hover:text-brand-text"
            }`}
          >
            <span>😀</span>
            <span>Emoji</span>
          </button>
          {onPickSticker && (
            <button
              type="button"
              onClick={() => setMode("stickers")}
              className={`pressable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                mode === "stickers"
                  ? "bg-brand-accent text-white shadow-sm"
                  : "text-brand-muted hover:text-brand-text"
              }`}
            >
              <span>🏷️</span>
              <span>Stickers</span>
            </button>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close picker"
            className="pressable rounded-lg p-1.5 text-xs text-brand-muted hover:bg-white/10 hover:text-brand-text"
          >
            ✕
          </button>
        )}
      </div>

      {mode === "stickers" && onPickSticker ? (
        <StickerPicker onPickSticker={onPickSticker} onClose={onClose} />
      ) : (
        <>
          {/* Search */}
          <div className="flex items-center gap-2 p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emojis & WeChat…"
              className="min-w-0 flex-1 rounded-xl border border-brand-border bg-black/25 px-3 py-1.5 text-sm text-brand-text placeholder:text-brand-muted focus:border-brand-accent focus:outline-none"
            />
          </div>

          {/* Grid */}
          <div ref={scrollRef} className="max-h-60 overflow-y-auto px-2 pb-2 overscroll-contain">
            {isSearching ? (
              <div className="grid grid-cols-8 gap-1">
                {searchResults.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    type="button"
                    onClick={() => onPick(emoji)}
                    className="pressable flex aspect-square items-center justify-center rounded-lg text-xl hover:bg-white/10 active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              EMOJI_CATEGORIES.map((cat) => (
                <div
                  key={cat.key}
                  ref={(el) => {
                    sectionRefs.current[cat.key] = el;
                  }}
                  className="mb-3"
                >
                  <div className="sticky top-0 z-10 bg-brand-surface2/95 py-1 text-[11px] font-semibold text-brand-muted backdrop-blur">
                    {cat.name}
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {cat.emojis.map((emoji, i) => (
                      <button
                        key={`${cat.key}-${emoji}-${i}`}
                        type="button"
                        onClick={() => onPick(emoji)}
                        className="pressable flex aspect-square items-center justify-center rounded-lg text-xl hover:bg-white/10 active:scale-95"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Category tab bar */}
          <div className="flex items-center gap-1 overflow-x-auto border-t border-brand-border p-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {EMOJI_CATEGORIES.map((cat) => {
              const active = !isSearching && cat.key === activeKey;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    scrollToCategory(cat.key);
                  }}
                  aria-label={cat.name}
                  title={cat.name}
                  className={
                    "pressable shrink-0 rounded-lg px-2 py-1 text-lg leading-none hover:bg-white/10 " +
                    (active ? "bg-white/10 text-brand-accent" : "text-brand-muted")
                  }
                >
                  {cat.icon}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
