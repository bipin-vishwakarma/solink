"use client";

import { useState } from "react";

/**
 * In-app full-screen image viewer (not a new browser tab). Supports Download and
 * Forward-to-a-contact. `url` is an already-decrypted object URL.
 */
export function ImageLightbox({
  url,
  name,
  contacts,
  onForward,
  onClose,
}: {
  url: string;
  name: string;
  contacts: string[];
  onForward: (username: string) => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      {/* top bar */}
      <div className="flex items-center gap-2 px-3 pt-[calc(0.75rem+var(--safe-top))] pb-2 text-white">
        <button
          onClick={onClose}
          className="pressable grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="min-w-0 flex-1 truncate text-sm opacity-80">{name}</div>
        <a
          href={url}
          download={name}
          className="pressable grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          title="Download"
          aria-label="Download"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        {contacts.length > 0 && (
          <button
            onClick={() => setPicking((v) => !v)}
            className="pressable grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
            title="Forward"
            aria-label="Forward"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M13 5l7 7-7 7M4 12h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* image */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* forward picker */}
      {picking && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/50" onClick={() => setPicking(false)}>
          <div
            className="slide-up max-h-[60%] w-full overflow-y-auto rounded-t-3xl border-t border-brand-border bg-brand-surface p-2 pb-[calc(1rem+var(--safe-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-sm font-medium text-brand-text">Forward to…</div>
            {contacts.map((u) => (
              <button
                key={u}
                onClick={() => {
                  onForward(u);
                  setPicking(false);
                }}
                className="pressable flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-brand-text hover:bg-white/5"
              >
                <span className="text-lg">↪️</span> {u}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
