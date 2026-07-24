"use client";

import type { ChatMessage } from "@/lib/types";

function timeOf(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Double-check tick (delivered look), à la WhatsApp — visual only. */
function Ticks() {
  return (
    <svg width="16" height="11" viewBox="0 0 18 12" fill="none" className="inline-block align-middle">
      <path d="M1 6.5L4.5 10L11 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 10L13 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MessageBubble({
  msg,
  grouped = false,
}: {
  msg: ChatMessage;
  grouped?: boolean; // true when it follows another message from the same sender
}) {
  return (
    <div className={`pop-in flex ${msg.mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
      <div
        className={`max-w-[76%] px-3.5 py-2 text-[14.5px] leading-snug shadow-sm ${
          msg.mine
            ? "bg-gradient-to-br from-brand-accent to-[#b5533a] text-white"
            : "border border-brand-border bg-brand-surface2 text-brand-text"
        } ${
          msg.mine
            ? grouped
              ? "rounded-2xl rounded-br-sm"
              : "rounded-2xl rounded-tr-md rounded-br-sm"
            : grouped
              ? "rounded-2xl rounded-bl-sm"
              : "rounded-2xl rounded-tl-md rounded-bl-sm"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
            msg.mine ? "text-white/75" : "text-brand-faint"
          }`}
        >
          {timeOf(msg.ts)}
          {msg.mine && <Ticks />}
        </div>
      </div>
    </div>
  );
}
