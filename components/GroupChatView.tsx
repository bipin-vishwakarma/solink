"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";

/**
 * Group chat view — end-to-end encrypted, additive. Renders its own header,
 * message list and composer, and is only mounted for the active group, so the
 * 1-on-1 ChatShell path is entirely separate.
 */
export function GroupChatView({
  name,
  members,
  messages,
  connecting,
  myName,
  onBack,
  onSend,
}: {
  name: string;
  members: { id: string; username: string }[];
  messages: ChatMessage[];
  connecting: boolean;
  myName: string;
  onBack: () => void;
  onSend: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  const memberLabel = members.length
    ? members.map((m) => (m.username === myName ? "You" : m.username)).join(", ")
    : "encrypted group";

  return (
    <>
      <header className="flex items-center gap-3 border-b border-brand-border bg-brand-surface/70 px-3 pb-2.5 pt-[calc(0.625rem+var(--safe-top))] backdrop-blur sm:px-4">
        <button
          onClick={onBack}
          className="pressable rounded-lg p-1.5 text-brand-muted hover:bg-white/5 md:hidden"
          aria-label="Back"
        >
          ←
        </button>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-accentSoft text-lg">
          👥
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-brand-text">{name || "Group"}</div>
          <div className="truncate text-[11px] text-brand-muted">
            {connecting ? "connecting…" : `${members.length} members · ${memberLabel}`}
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
      >
        {connecting && messages.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                <div
                  className={`skeleton h-9 rounded-2xl ${i % 2 ? "rounded-br-sm" : "rounded-bl-sm"}`}
                  style={{ width: `${130 + ((i * 53) % 120)}px` }}
                />
              </div>
            ))}
          </div>
        )}
        {!connecting && messages.length === 0 && (
          <div className="mt-12 text-center text-sm text-brand-faint">
            No messages yet — say hi to the group 👋
          </div>
        )}
        {messages.map((m, i, arr) => {
          const prev = arr[i - 1];
          const grouped =
            !!prev && prev.mine === m.mine && prev.senderName === m.senderName && m.ts - prev.ts < 5 * 60 * 1000;
          return <MessageBubble key={m.id} msg={m} grouped={grouped} showSender={!m.mine && !grouped} />;
        })}
      </div>

      <Composer onSend={onSend} disabled={connecting} />
    </>
  );
}
