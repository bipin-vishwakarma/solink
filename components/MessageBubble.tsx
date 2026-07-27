"use client";

import { useEffect, useRef, useState } from "react";
import type { AttachmentMeta, AttachmentRef, ChatMessage, ReactionSummary } from "@/lib/types";

const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

function timeOf(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Resolver = (ref: AttachmentRef) => Promise<Blob | null>;

function AttachmentView({
  meta,
  resolve,
  mine,
}: {
  meta: AttachmentMeta;
  resolve?: Resolver;
  mine: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;
    (async () => {
      if (!resolve) return;
      const blob = await resolve(meta.ref).catch(() => null);
      if (!blob) {
        if (!cancelled) setFailed(true);
        return;
      }
      objUrl = URL.createObjectURL(new Blob([blob], { type: meta.mime }));
      if (cancelled) URL.revokeObjectURL(objUrl);
      else setUrl(objUrl);
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [meta, resolve]);

  const isImage = meta.mime.startsWith("image/");
  const isAudio = meta.mime.startsWith("audio/");

  if (isAudio) {
    return (
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">🎙️</span>
        {url ? (
          <audio controls src={url} className="h-9 max-w-[220px]" onClick={(e) => e.stopPropagation()} />
        ) : (
          <span className="text-xs opacity-70">{failed ? "🔒 couldn't load" : "decrypting…"}</span>
        )}
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="mb-1 overflow-hidden rounded-lg">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <img src={url} alt={meta.name} className="max-h-72 w-auto max-w-full rounded-lg" />
          </a>
        ) : (
          <div className="grid h-40 w-56 place-items-center bg-black/20 text-xs text-brand-muted">
            {failed ? "🔒 couldn't load" : "decrypting…"}
          </div>
        )}
      </div>
    );
  }

  return (
    <a
      href={url ?? undefined}
      download={meta.name}
      onClick={(e) => e.stopPropagation()}
      className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 ${
        mine ? "bg-black/15" : "bg-black/20"
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/10 text-lg">📄</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{meta.name}</span>
        <span className="block text-[11px] opacity-70">
          {failed ? "couldn't load" : url ? `${formatSize(meta.size)} · download` : "decrypting…"}
        </span>
      </span>
    </a>
  );
}

function Ticks() {
  return (
    <svg width="16" height="11" viewBox="0 0 18 12" fill="none" className="inline-block align-middle">
      <path d="M1 6.5L4.5 10L11 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 10L13 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const IS_URL = /^https?:\/\/[^\s]+$/;

/** Render text with clickable links. */
function Linkified({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(URL_SPLIT);
  return (
    <>
      {parts.map((part, i) =>
        IS_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`underline underline-offset-2 ${mine ? "text-white" : "text-brand-accent"}`}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function MessageBubble({
  msg,
  grouped = false,
  onReply,
  resolveAttachment,
  reactions,
  onReact,
}: {
  msg: ChatMessage;
  grouped?: boolean;
  onReply?: (m: ChatMessage) => void;
  resolveAttachment?: Resolver;
  reactions?: ReactionSummary[];
  onReact?: (emoji: string) => void;
}) {
  const [showReactBar, setShowReactBar] = useState(false);
  const touchStartX = useRef<number | null>(null);

  function copy() {
    navigator.clipboard?.writeText(msg.text).catch(() => {});
  }

  const actions = (
    <div
      className={`flex shrink-0 items-center gap-1 self-center opacity-0 transition group-hover:opacity-100 ${
        msg.mine ? "order-first" : ""
      }`}
    >
      {onReply && (
        <button
          onClick={() => onReply(msg)}
          className="rounded-full bg-brand-surface2 p-1.5 text-brand-muted hover:text-brand-text"
          title="Reply"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 17l-6-5 6-5v3c6 0 9 3 10 8-2.5-2.5-5-4-10-4v3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <button
        onClick={copy}
        className="rounded-full bg-brand-surface2 p-1.5 text-brand-muted hover:text-brand-text"
        title="Copy"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      {onReact && (
        <button
          onClick={() => setShowReactBar((v) => !v)}
          className="rounded-full bg-brand-surface2 p-1.5 text-brand-muted hover:text-brand-text"
          title="React"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 10h.01M15 10h.01M8.5 14a4 4 0 007 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`group relative flex items-center gap-2 ${msg.mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null || !onReply) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) > 55) onReply(msg);
      }}
    >
      {showReactBar && onReact && (
        <div
          className={`pop-in absolute -top-8 z-20 flex gap-1 rounded-full border border-brand-border bg-brand-surface2 px-2 py-1 shadow-xl ${msg.mine ? "right-0" : "left-0"}`}
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => {
                onReact(e);
                setShowReactBar(false);
              }}
              className="pressable text-lg leading-none transition hover:scale-125"
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {actions}
      <div
        className={`pop-in max-w-[76%] px-3.5 py-2 text-[14.5px] leading-snug shadow-sm ${
          msg.mine
            ? "bg-gradient-to-br from-brand-accent to-[#b5533a] text-white"
            : "border border-brand-border bg-brand-surface2 text-brand-text"
        } ${
          msg.mine
            ? grouped ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-tr-md rounded-br-sm"
            : grouped ? "rounded-2xl rounded-bl-sm" : "rounded-2xl rounded-tl-md rounded-bl-sm"
        }`}
      >
        {msg.replyTo && (
          <div
            className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-[12px] ${
              msg.mine ? "border-white/70 bg-black/15 text-white/80" : "border-brand-accent bg-black/20 text-brand-muted"
            }`}
          >
            <div className="font-medium opacity-80">{msg.replyTo.mine ? "You" : "Them"}</div>
            <div className="truncate opacity-90">{msg.replyTo.preview}</div>
          </div>
        )}
        {msg.attachment && (
          <AttachmentView meta={msg.attachment} resolve={resolveAttachment} mine={msg.mine} />
        )}
        {msg.text && (
          <div className="whitespace-pre-wrap break-words">
            <Linkified text={msg.text} mine={msg.mine} />
          </div>
        )}
        <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${msg.mine ? "text-white/75" : "text-brand-faint"}`}>
          {timeOf(msg.ts)}
          {msg.mine && (
            <span className={msg.read ? "text-[#53bdeb]" : ""}>
              <Ticks />
            </span>
          )}
        </div>
        {reactions && reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact?.(r.emoji)}
                className={`pressable flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                  r.mine ? "bg-white/25 ring-1 ring-white/40" : "bg-black/20"
                } ${msg.mine ? "text-white" : "text-brand-text"}`}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="font-medium">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
