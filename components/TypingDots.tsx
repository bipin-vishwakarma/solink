"use client";

/** Three bouncing dots inside a chat bubble — the classic "peer is typing" indicator. */
export function TypingDots() {
  return (
    <div className="pop-in flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-brand-border bg-brand-surface2 px-4 py-3 text-brand-muted">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}
