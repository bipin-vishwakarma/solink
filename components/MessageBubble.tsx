"use client";

import type { ChatMessage } from "@/lib/types";

function timeOf(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`pop-in flex ${msg.mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[76%] rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug shadow-sm ${
          msg.mine
            ? "rounded-br-sm bg-gradient-to-br from-brand-accent to-[#b5533a] text-white"
            : "rounded-bl-sm border border-brand-border bg-brand-surface2 text-brand-text"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        <div
          className={`mt-0.5 text-right text-[10px] ${
            msg.mine ? "text-white/70" : "text-brand-faint"
          }`}
        >
          {timeOf(msg.ts)}
        </div>
      </div>
    </div>
  );
}
