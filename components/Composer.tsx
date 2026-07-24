"use client";

import { useEffect, useRef, useState } from "react";

const EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "😎", "🥳", "😉", "😭", "😱",
  "👍", "👎", "🙏", "👏", "🙌", "💪", "🔥", "✨", "💯", "🎉",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "😅", "😴",
  "🤔", "🙄", "😏", "😬", "🤝", "👀", "💀", "🤙", "✌️", "🫡",
];

export function Composer({
  onSend,
  onTyping,
  disabled,
}: {
  onSend: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
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
    <div className="relative border-t border-brand-border bg-brand-surface/70 p-3 backdrop-blur">
      {showEmoji && (
        <div className="absolute bottom-[68px] left-3 z-10 grid max-h-48 w-64 grid-cols-8 gap-1 overflow-y-auto rounded-2xl border border-brand-border bg-brand-surface2 p-2 shadow-2xl">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                handleChange(text + e);
                taRef.current?.focus();
              }}
              className="rounded-lg p-1 text-xl transition hover:bg-white/10"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          className={`grid h-11 w-10 shrink-0 place-items-center rounded-full text-xl transition ${
            showEmoji ? "text-brand-accent" : "text-brand-muted hover:text-brand-text"
          }`}
          aria-label="Emoji"
          type="button"
        >
          😊
        </button>

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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-accent text-white transition hover:bg-brand-accentHover disabled:opacity-40"
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
