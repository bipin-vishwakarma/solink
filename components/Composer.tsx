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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  function shareLocation() {
    setShowAttachMenu(false);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        onSend(`📍 My location: https://www.google.com/maps?q=${latitude},${longitude}`);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendOnStopRef = useRef(false);
  const lastSubmitRef = useRef(0);

  async function startRecording() {
    if (!onAttach || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        setRecording(false);
        setRecSecs(0);
        if (sendOnStopRef.current && chunksRef.current.length) {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
          onAttach?.(file);
        }
      };
      rec.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      /* mic denied / unavailable */
    }
  }

  function stopRecording(send: boolean) {
    sendOnStopRef.current = send;
    recorderRef.current?.stop();
  }

  // auto-grow the textarea up to a cap without collapsing to 0px
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (!text) {
      ta.style.height = "";
      return;
    }
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
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
    const now = Date.now();
    if (now - lastSubmitRef.current < 200) return;
    const t = text.trim();
    if (!t) return;
    lastSubmitRef.current = now;
    onSend(t);
    setText("");
    setShowEmoji(false);
    stopTyping();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // Keep textarea focused so mobile virtual keyboard stays open
    if (taRef.current) {
      taRef.current.focus();
      requestAnimationFrame(() => {
        taRef.current?.focus();
      });
      setTimeout(() => {
        taRef.current?.focus();
      }, 50);
    }
  }

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const hasText = Boolean(text.trim());
  const canSend = hasText || !onAttach;

  return (
    <div className="relative border-t border-brand-border bg-brand-surface/70 px-2 pt-2 pb-[calc(0.5rem+var(--safe-bottom))] backdrop-blur sm:px-3 sm:pt-3 sm:pb-[calc(0.75rem+var(--safe-bottom))]">
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

      {recording ? (
        <div className="flex items-center gap-3 py-1">
          <span className="flex items-center gap-2 text-sm text-red-400">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            Recording {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => stopRecording(false)}
            className="pressable rounded-full px-3 py-1 text-sm text-brand-muted hover:bg-white/5 hover:text-brand-text"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={() => stopRecording(true)}
            className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-accent text-white transition hover:bg-brand-accentHover"
            aria-label="Send voice note"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-0.5 sm:gap-1">
          <button
            onClick={() => setShowEmoji((v) => !v)}
            className={`pressable grid h-11 w-10 shrink-0 place-items-center rounded-full text-xl transition sm:w-9 ${
              showEmoji ? "text-brand-accent" : "text-brand-muted hover:text-brand-text"
            }`}
            aria-label="Emoji"
            type="button"
          >
            😊
          </button>
          {onAttach && (
            <div className="relative">
              {showAttachMenu && (
                <div className="pop-in absolute bottom-12 left-0 z-20 w-44 overflow-hidden rounded-2xl border border-brand-border bg-brand-surface2 shadow-2xl">
                  <button
                    onClick={() => {
                      setShowAttachMenu(false);
                      fileRef.current?.click();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5"
                    type="button"
                  >
                    <span className="text-lg">📷</span> Photo / File
                  </button>
                  <button
                    onClick={shareLocation}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-brand-text hover:bg-white/5"
                    type="button"
                  >
                    <span className="text-lg">📍</span> Location
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowAttachMenu((v) => !v)}
                className={`pressable grid h-11 w-10 shrink-0 place-items-center rounded-full transition sm:w-9 ${
                  showAttachMenu ? "text-brand-accent" : "text-brand-muted hover:text-brand-text"
                }`}
                aria-label="Attach"
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3.5 3.5 0 015 5L10.5 18a2 2 0 01-3-3l7.5-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}

          <textarea
            ref={taRef}
            value={text}
            rows={1}
            disabled={disabled}
            enterKeyHint="send"
            onChange={(e) => handleChange(e.target.value)}
            onBlur={stopTyping}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type a message"
            className="min-w-0 max-h-[140px] min-h-[44px] flex-1 resize-none overflow-y-auto rounded-2xl border border-brand-border bg-black/25 px-3 py-2.5 text-brand-text outline-none focus:border-brand-accent disabled:opacity-50 sm:px-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          />

          <button
            key="composer-action-btn"
            type="button"
            onPointerDown={(e) => {
              if (canSend) {
                e.preventDefault();
                taRef.current?.focus();
              }
            }}
            onMouseDown={(e) => {
              if (canSend) {
                e.preventDefault();
                taRef.current?.focus();
              }
            }}
            onTouchEnd={(e) => {
              if (canSend && hasText) {
                e.preventDefault();
                submit();
              }
            }}
            onClick={() => {
              if (canSend) {
                if (hasText) submit();
              } else {
                startRecording();
              }
            }}
            disabled={disabled || (canSend && !hasText)}
            className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-accent text-white transition hover:bg-brand-accentHover disabled:opacity-40"
            aria-label={canSend ? "Send" : "Record voice note"}
          >
            {canSend ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
