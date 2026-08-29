"use client";

import { useEffect, useRef, useState } from "react";
import { WeChatDrawer } from "./WeChatDrawer";
import { WeChatActionDrawer } from "./WeChatActionDrawer";
import { stickerToFile, type Sticker } from "@/lib/stickers";

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
  const [showEmojiDrawer, setShowEmojiDrawer] = useState(false);
  const [showActionDrawer, setShowActionDrawer] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  function shareLocation() {
    setShowActionDrawer(false);
    if (!navigator.geolocation) {
      setActionToast("Location services not supported on this device");
      setTimeout(() => setActionToast(null), 2500);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        onSend(`📍 My location: https://www.google.com/maps?q=${latitude},${longitude}`);
      },
      () => {
        setActionToast("Could not access location");
        setTimeout(() => setActionToast(null), 2500);
      },
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
    if (now - lastSubmitRef.current < 200) {
      taRef.current?.focus();
      return;
    }
    const t = text.trim();
    if (!t) {
      taRef.current?.focus();
      return;
    }
    lastSubmitRef.current = now;
    onSend(t);
    setText("");
    setShowEmojiDrawer(false);
    setShowActionDrawer(false);
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
      }, 40);
      setTimeout(() => {
        taRef.current?.focus();
      }, 120);
    }
  }

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const hasText = Boolean(text.trim());
  const canSend = hasText || !onAttach;

  const handlePickSticker = async (sticker: Sticker) => {
    if (!onAttach) return;
    try {
      const file = await stickerToFile(sticker);
      onAttach(file);
    } catch (err) {
      console.error("Failed to send sticker", err);
    }
  };

  const handleCustomAction = (actionId: string) => {
    setShowActionDrawer(false);
    if (actionId === "call") {
      setActionToast("📞 Voice & video calling coming soon!");
      setTimeout(() => setActionToast(null), 2500);
    } else if (actionId === "lucky") {
      handleChange("[RedPacket] Best Wishes! 🧧");
      taRef.current?.focus();
    } else if (actionId === "contact") {
      const myName = typeof window !== "undefined" ? localStorage.getItem("solink:name") || "user" : "user";
      handleChange(`📇 Contact Card: @${myName}`);
      taRef.current?.focus();
    } else if (actionId === "favorites") {
      setShowEmojiDrawer(true);
    }
  };

  return (
    <div className="relative border-t border-brand-border bg-brand-surface/70 backdrop-blur">
      <div className="px-2 pt-2 pb-[calc(0.5rem+var(--safe-bottom))] sm:px-3 sm:pt-3 sm:pb-[calc(0.75rem+var(--safe-bottom))]">

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
        <div className="slide-up flex items-center gap-2.5 py-1 px-1 bg-brand-surface2/40 rounded-2xl border border-red-500/20">
          {/* Pulsing live record dot with glowing ring */}
          <div className="relative flex items-center justify-center ml-1">
            <span className="animate-pulse-ring absolute h-6 w-6 rounded-full bg-red-500/30" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm" />
          </div>

          {/* Recording Timer */}
          <span className="font-mono text-sm font-semibold text-red-400 min-w-[36px]">
            {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
          </span>

          {/* Animated audio waveform equalizer bars */}
          <div className="flex h-5 items-center gap-[3px] px-1.5 overflow-hidden">
            {[0.4, 0.8, 0.3, 0.95, 0.6, 0.85, 0.45, 0.7, 0.5, 0.9, 0.35, 0.65].map((scale, i) => (
              <span
                key={i}
                style={{
                  animationDelay: `${(i % 5) * 0.15}s`,
                  animationDuration: `${0.6 + (i % 3) * 0.2}s`,
                }}
                className="animate-wave-bar w-[2.5px] rounded-full bg-red-400/80"
              />
            ))}
          </div>

          <div className="flex-1" />

          {/* Cancel button */}
          <button
            onClick={() => stopRecording(false)}
            className="pressable rounded-full px-3 py-1 text-xs font-medium text-brand-muted hover:bg-white/5 hover:text-brand-text transition"
            type="button"
          >
            Cancel
          </button>

          {/* Send voice note button */}
          <button
            onClick={() => stopRecording(true)}
            className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-accent text-white shadow-lg transition hover:bg-brand-accentHover"
            aria-label="Send voice note"
            type="button"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-0.5 sm:gap-1"
        >
          <button
            onClick={() => {
              if (showEmojiDrawer) {
                setShowEmojiDrawer(false);
                taRef.current?.focus();
              } else {
                setShowActionDrawer(false);
                taRef.current?.blur();
                setShowEmojiDrawer(true);
              }
            }}
            className={`pressable grid h-11 w-10 shrink-0 place-items-center rounded-full text-xl transition sm:w-9 ${
              showEmojiDrawer ? "text-brand-accent scale-105" : "text-brand-muted hover:text-brand-text"
            }`}
            aria-label={showEmojiDrawer ? "Switch to keyboard" : "WeChat emojis and stickers"}
            title={showEmojiDrawer ? "Switch to keyboard" : "WeChat emojis and stickers"}
            type="button"
            tabIndex={-1}
          >
            {showEmojiDrawer ? "⌨️" : "😊"}
          </button>
          {onAttach && (
            <button
              onClick={() => {
                if (showActionDrawer) {
                  setShowActionDrawer(false);
                  taRef.current?.focus();
                } else {
                  setShowEmojiDrawer(false);
                  taRef.current?.blur();
                  setShowActionDrawer(true);
                }
              }}
              className={`pressable grid h-11 w-10 shrink-0 place-items-center rounded-full transition-all duration-200 sm:w-9 ${
                showActionDrawer
                  ? "text-brand-accent rotate-45 scale-105"
                  : "text-brand-muted hover:text-brand-text rotate-0"
              }`}
              aria-label={showActionDrawer ? "Close actions" : "More actions"}
              title={showActionDrawer ? "Close actions" : "More actions"}
              type="button"
              tabIndex={-1}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}

          <textarea
            ref={taRef}
            value={text}
            rows={1}
            disabled={disabled}
            enterKeyHint="send"
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              if (showEmojiDrawer) setShowEmojiDrawer(false);
              if (showActionDrawer) setShowActionDrawer(false);
            }}
            onClick={() => {
              if (showEmojiDrawer) setShowEmojiDrawer(false);
              if (showActionDrawer) setShowActionDrawer(false);
            }}
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
            type={canSend ? "submit" : "button"}
            tabIndex={canSend ? -1 : 0}
            onTouchStart={(e) => {
              if (canSend) {
                e.preventDefault();
              }
            }}
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
            onClick={(e) => {
              if (canSend) {
                e.preventDefault();
                if (hasText) submit();
              } else {
                startRecording();
              }
            }}
            disabled={disabled || (canSend && !hasText)}
            className="pressable group grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-accent text-white transition hover:bg-brand-accentHover disabled:opacity-40 shadow-sm"
            aria-label={canSend ? "Send" : "Record voice note"}
          >
            <span className="transition-transform duration-150 group-active:scale-90">
              {canSend ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="fade-in">
                  <path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="fade-in">
                  <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </span>
          </button>
        </form>
      )}
      </div>

      {actionToast && (
        <div className="pop-in pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-brand-surface2/95 border border-brand-border px-4 py-1.5 text-xs font-medium text-brand-text shadow-xl backdrop-blur">
          <span>{actionToast}</span>
        </div>
      )}

      {showEmojiDrawer && (
        <WeChatDrawer
          onPickEmoji={(e) => {
            handleChange(text + e);
          }}
          onPickSticker={onAttach ? handlePickSticker : undefined}
          onBackspace={() => {
            if (!text) return;
            const chars = Array.from(text);
            chars.pop();
            handleChange(chars.join(""));
          }}
        />
      )}

      {showActionDrawer && onAttach && (
        <WeChatActionDrawer
          onAttachFile={(file) => {
            setShowActionDrawer(false);
            onAttach(file);
          }}
          onShareLocation={shareLocation}
          onCustomAction={handleCustomAction}
        />
      )}
    </div>
  );
}
