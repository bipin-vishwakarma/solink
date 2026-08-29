"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AttachmentMeta, AttachmentRef, ChatMessage, ReactionSummary } from "@/lib/types";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { saveCustomSticker } from "@/lib/stickers";

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
  onOpenImage,
}: {
  meta: AttachmentMeta;
  resolve?: Resolver;
  mine: boolean;
  onOpenImage?: (url: string, name: string) => void;
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
      <div className="mb-1">
        {url ? (
          <VoiceNotePlayer src={url} isMine={mine} />
        ) : (
          <div className="flex items-center gap-2 py-1.5 px-2.5 text-xs opacity-70">
            <span className="text-base">🎙️</span>
            <span>{failed ? "🔒 couldn't load" : "decrypting…"}</span>
          </div>
        )}
      </div>
    );
  }

  const isSticker = meta.name.startsWith("sticker-") || meta.name.includes(".sticker.");
  if (isSticker) {
    return (
      <div className="relative inline-block select-none my-0.5">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={meta.name}
            className="h-32 w-32 object-contain pointer-events-auto select-none drop-shadow"
            onClick={(e) => {
              e.stopPropagation();
              onOpenImage?.(url, meta.name);
            }}
          />
        ) : (
          <div className="grid h-32 w-32 place-items-center rounded-xl bg-black/10 text-xs text-brand-muted">
            {failed ? "🔒 couldn't load" : "decrypting…"}
          </div>
        )}
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="mb-1 overflow-hidden rounded-lg">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={meta.name}
            className="max-h-72 w-auto max-w-full cursor-pointer rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              onOpenImage?.(url, meta.name);
            }}
          />
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
  onOpenImage,
  onRetry,
  onDelete,
  showSender = false,
  animate = false,
}: {
  msg: ChatMessage;
  grouped?: boolean;
  onReply?: (m: ChatMessage) => void;
  resolveAttachment?: Resolver;
  reactions?: ReactionSummary[];
  onReact?: (emoji: string) => void;
  onOpenImage?: (url: string, name: string) => void;
  onRetry?: () => void;
  onDelete?: () => void;
  showSender?: boolean;
  animate?: boolean;
}) {
  const [showReactBar, setShowReactBar] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stickerSaved, setStickerSaved] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const isSticker = Boolean(
    msg.attachment && (msg.attachment.name.startsWith("sticker-") || msg.attachment.name.includes(".sticker."))
  );

  async function handleSaveSticker() {
    if (!msg.attachment || !resolveAttachment) return;
    try {
      const blob = await resolveAttachment(msg.attachment.ref);
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        saveCustomSticker({
          id: `saved-${Date.now()}`,
          name: msg.attachment?.name.replace(/^sticker-|\.sticker\.[a-z0-9]+$/gi, "") || "Sticker",
          dataUrl,
        });
        setStickerSaved(true);
        setTimeout(() => setStickerSaved(false), 2000);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error("Failed to save sticker", e);
    }
  }

  function copy() {
    if (!msg.text) return;
    navigator.clipboard?.writeText(msg.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const actions = (
    <div
      className={`flex shrink-0 items-center gap-1 self-center opacity-0 transition group-hover:opacity-100 ${
        msg.mine ? "order-first" : "order-last"
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
        className="rounded-full bg-brand-surface2 p-1.5 text-brand-muted hover:text-brand-text transition"
        title={copied ? "Copied!" : "Copy"}
        aria-label={copied ? "Copied to clipboard" : "Copy"}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
      {isSticker && (
        <button
          onClick={() => void handleSaveSticker()}
          className="rounded-full bg-brand-surface2 p-1.5 text-brand-muted hover:text-amber-300 transition"
          title="Save to Stickers"
          aria-label="Save to Stickers"
        >
          ⭐
        </button>
      )}
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
      {msg.mine && onDelete && (
        <button
          onClick={() => {
            if (msg.status === "failed" || confirm("Unsend this message for everyone?")) onDelete();
          }}
          className="rounded-full bg-brand-surface2 p-1.5 text-brand-muted hover:text-red-400"
          title="Unsend"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`group relative flex items-center gap-2 ${msg.mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (!touch) return;
        didLongPress.current = false;
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = setTimeout(() => {
          didLongPress.current = true;
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try { navigator.vibrate(20); } catch {}
          }
          setMobileSheetOpen(true);
        }, 450);
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        if (!touch || !touchStartPos.current) return;
        const dx = Math.abs(touch.clientX - touchStartPos.current.x);
        const dy = Math.abs(touch.clientY - touchStartPos.current.y);
        if (dx > 10 || dy > 10) {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }
      }}
      onTouchEnd={(e) => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        const start = touchStartPos.current;
        touchStartPos.current = null;
        if (didLongPress.current || start == null || !onReply) return;
        const dx = (e.changedTouches[0]?.clientX ?? start.x) - start.x;
        if (Math.abs(dx) > 55) onReply(msg);
      }}
      onTouchCancel={() => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        touchStartPos.current = null;
        didLongPress.current = false;
      }}
      onContextMenu={(e) => {
        if (touchStartPos.current || didLongPress.current) {
          e.preventDefault();
        }
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
        className={`${animate ? "message-bubble-new" : ""} max-w-[76%] select-none text-[14.5px] leading-snug [-webkit-touch-callout:none] ${
          isSticker
            ? "relative bg-transparent border-none shadow-none p-0"
            : msg.mine
              ? "bg-gradient-to-br from-brand-accent to-[#b5533a] text-white px-3 py-1.5 shadow-sm " +
                (grouped ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-tr-md rounded-br-sm")
              : "border border-brand-border bg-brand-surface2 text-brand-text px-3 py-1.5 shadow-sm " +
                (grouped ? "rounded-2xl rounded-bl-sm" : "rounded-2xl rounded-tl-md rounded-bl-sm")
        }`}
      >
        {showSender && !msg.mine && (
          <div className="mb-0.5 text-[11px] font-semibold text-brand-accent">{msg.senderName}</div>
        )}
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
          <AttachmentView
            meta={msg.attachment}
            resolve={resolveAttachment}
            mine={msg.mine}
            onOpenImage={onOpenImage}
          />
        )}
        {msg.text && (
          <div className="select-none whitespace-pre-wrap break-words [-webkit-touch-callout:none]">
            <Linkified text={msg.text} mine={msg.mine} />
          </div>
        )}
        <div
          className={`mt-px flex items-center justify-end gap-1 text-[10px] leading-none ${
            isSticker
              ? "absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-white/90 backdrop-blur-sm shadow"
              : msg.mine
                ? "text-white/75"
                : "text-brand-faint"
          }`}
        >
          {msg.mine && (msg.status === "failed" || msg.status === "queued") ? (
            <button
              onClick={onRetry}
              className={`flex items-center gap-1 font-medium underline underline-offset-2 ${
                msg.status === "queued"
                  ? "text-amber-100 decoration-amber-100/60"
                  : "text-red-200 decoration-red-200/60"
              }`}
              title="Tap to retry"
            >
              {msg.status === "queued" ? "🕓 Queued · Retry" : "⚠ Not sent · Retry"}
            </button>
          ) : (
            <>
              {timeOf(msg.ts)}
              {msg.mine &&
                (msg.status === "sending" ? (
                  <span className="opacity-70" title="Sending…">🕓</span>
                ) : (
                  <span className={msg.read ? "text-[#53bdeb]" : ""}>
                    <Ticks />
                  </span>
                ))}
            </>
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

      {copied && typeof document !== "undefined" &&
        createPortal(
          <div className="animate-toast pointer-events-none fixed bottom-[calc(74px+var(--kb)+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 rounded-full border border-emerald-500/40 bg-brand-surface/95 px-3.5 py-1.5 text-xs font-medium text-emerald-400 shadow-2xl backdrop-blur">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Copied to clipboard</span>
          </div>,
          document.body
        )}

      {stickerSaved && typeof document !== "undefined" &&
        createPortal(
          <div className="animate-toast pointer-events-none fixed bottom-[calc(74px+var(--kb)+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 rounded-full border border-amber-500/40 bg-brand-surface/95 px-3.5 py-1.5 text-xs font-medium text-amber-300 shadow-2xl backdrop-blur">
            <span>⭐</span>
            <span>Saved to Stickers</span>
          </div>,
          document.body
        )}

      {mobileSheetOpen && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] sm:hidden">
            <button
              type="button"
              aria-label="Close message menu"
              className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[1px]"
              onClick={() => setMobileSheetOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Message options"
              className="slide-up absolute inset-x-2 bottom-[calc(0.5rem+var(--safe-bottom))] max-h-[min(72dvh,34rem)] overflow-y-auto overscroll-contain rounded-2xl border border-brand-border bg-brand-surface2 p-3 shadow-2xl"
            >
              {onReact && (
                <div className="mb-3 flex items-center justify-around border-b border-brand-border pb-3">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(emoji);
                        setMobileSheetOpen(false);
                      }}
                      className="pressable text-2xl leading-none transition hover:scale-125 active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {isSticker && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveSticker();
                      setMobileSheetOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-amber-300 hover:bg-white/5 active:bg-white/10"
                  >
                    <span className="text-base">⭐</span>
                    <span>Save to Stickers</span>
                  </button>
                )}
                {msg.text && (
                  <button
                    type="button"
                    onClick={() => {
                      copy();
                      setMobileSheetOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-brand-text hover:bg-white/5 active:bg-white/10"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    <span>Copy text</span>
                  </button>
                )}
                {onReply && (
                  <button
                    type="button"
                    onClick={() => {
                      onReply(msg);
                      setMobileSheetOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-brand-text hover:bg-white/5 active:bg-white/10"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M9 17l-6-5 6-5v3c6 0 9 3 10 8-2.5-2.5-5-4-10-4v3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                    <span>Reply</span>
                  </button>
                )}
                {msg.mine && onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSheetOpen(false);
                      if (msg.status === "failed" || confirm("Unsend this message for everyone?")) {
                        onDelete();
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-400 hover:bg-red-500/10 active:bg-red-500/20"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Unsend message</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
