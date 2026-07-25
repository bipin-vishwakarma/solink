"use client";

import { useEffect, useRef, useState } from "react";
import { EmojiPicker } from "./EmojiPicker";

export function Composer({
  onSend,
  onTyping,
  onAttach,
  disabled,
}: {
  onSend: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  onAttach?: (file: File) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // auto-grow the textarea up to a cap
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [text]);

  function stopTyping() {
    if (typingRef.current) {
      typingRef.current = false;
      onTyping?.(false);
    }
  }

  function handleChange(v: string) {
    setText(v);
    if (v && !typingRef.current) {
      typingRef.current = true;
      onTyping?.(true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, 1500);
    if (!v) stopTyping();
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    setShowEmoji(false);
    stopTyping();
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  return (
    <div className="relative border-t border-brand-border bg-brand-surface/70 px-3 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] backdrop-blur">
      {showEmoji && (
        <div className="absolute bottom-[68px] left-2 z-20">
          <EmojiPicker
            onPick={(e) => {
              handleChange(text + e);
              taRef.current?.focus();
            }}
            onClose={() => setShowEmoji(false)}
          />
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onAttach) onAttach(f);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      <div className="flex items-end gap-1">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          className={`grid h-11 w-9 shrink-0 place-items-center rounded-full text-xl transition ${
            showEmoji ? "text-brand-accent" : "text-brand-muted hover:text-brand-text"
          }`}
          aria-label="Emoji"
          type="button"
        >
          😊
        </button>
        {onAttach && (
          <button
            onClick={() => fileRef.current?.click()}
            className="grid h-11 w-9 shrink-0 place-items-center rounded-full text-brand-muted transition hover:text-brand-text"
            aria-label="Attach file"
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3.5 3.5 0 015 5L10.5 18a2 2 0 01-3-3l7.5-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        <textarea
          ref={taRef}
          value={text}
          rows={1}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type a message"
          className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-2xl border border-brand-border bg-black/25 px-4 py-2.5 text-brand-text outline-none focus:border-brand-accent disabled:opacity-50"
        />

        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-accent text-white transition hover:bg-brand-accentHover disabled:opacity-40"
          aria-label="Send"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
