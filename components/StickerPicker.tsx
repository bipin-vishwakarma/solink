"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BUILTIN_STICKER_PACKS,
  getCustomStickers,
  saveCustomSticker,
  type Sticker,
} from "@/lib/stickers";

export function StickerPicker({
  onPickSticker,
  onClose,
}: {
  onPickSticker: (sticker: Sticker) => void;
  onClose?: () => void;
}) {
  const [activePackId, setActivePackId] = useState<string>("doge");
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
      // Resize to compact dimensions via Canvas
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

  const currentStickers: Sticker[] =
    activePackId === "favorites"
      ? customStickers
      : BUILTIN_STICKER_PACKS.find((p) => p.id === activePackId)?.stickers ?? [];

  return (
    <div className="flex flex-col h-[280px] w-full">
      {/* Hidden file input for custom stickers */}
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAddCustomSticker}
      />

      {/* Sticker Grid */}
      <div className="flex-1 overflow-y-auto p-3 overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {activePackId === "favorites" && customStickers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-brand-muted">
            <span className="text-3xl">⭐</span>
            <p>No saved stickers yet.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="pressable mt-1 rounded-full border border-brand-accent/40 bg-brand-accent/20 px-3 py-1 text-xs font-medium text-brand-accent hover:bg-brand-accent/30"
              type="button"
            >
              + Add from Photos / Files
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2.5">
            {activePackId === "favorites" && (
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
            {currentStickers.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => {
                  onPickSticker(sticker);
                  onClose?.();
                }}
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

      {/* Bottom Pack Selector Bar */}
      <div className="flex items-center justify-around border-t border-brand-border/60 bg-brand-surface/90 px-2 py-1.5 backdrop-blur shrink-0">
        <button
          onClick={() => setActivePackId("favorites")}
          className={`pressable flex items-center justify-center rounded-xl px-2.5 py-1 text-sm transition ${
            activePackId === "favorites"
              ? "bg-brand-accent text-white shadow-sm"
              : "text-brand-muted hover:text-brand-text hover:bg-white/5"
          }`}
          title="Favorites"
          type="button"
        >
          ⭐
        </button>
        {BUILTIN_STICKER_PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => setActivePackId(pack.id)}
            className={`pressable flex items-center justify-center rounded-xl px-2.5 py-1 text-sm transition ${
              activePackId === pack.id
                ? "bg-brand-accent text-white shadow-sm"
                : "text-brand-muted hover:text-brand-text hover:bg-white/5"
            }`}
            title={pack.name}
            type="button"
          >
            {pack.icon}
          </button>
        ))}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="pressable flex items-center justify-center rounded-xl px-2.5 py-1 text-xs font-semibold text-brand-muted hover:text-brand-accent hover:bg-white/5 transition"
          title="Upload custom sticker"
          type="button"
        >
          ➕
        </button>
      </div>
    </div>
  );
}
