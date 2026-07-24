"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatTransport, TransportEvents } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { CodeSnippet } from "./CodeSnippet";
import { BossModeIDE } from "./BossModeIDE";
import { Sidebar, type Contact } from "./Sidebar";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { TypingDots } from "./TypingDots";
import { requestNotifyPermission, showMessageNotification, notifyPermission } from "@/lib/notify";
import { encodeMessage, decodeMessage } from "@/lib/envelope";

export type TransportFactory = (
  peerUsername: string,
  events: TransportEvents
) => ChatTransport;

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() === db.toDateString();
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

// A short WebAudio "ping" for incoming messages — no asset file needed.
function playPing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    /* audio not available */
  }
}

export function ChatShell({
  myName,
  makeTransport,
  onSignOut,
}: {
  myName: string;
  makeTransport: TransportFactory;
  onSignOut?: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<string | null>(null);
  const [messagesByContact, setMessagesByContact] = useState<Record<string, ChatMessage[]>>({});

  const [peerName, setPeerName] = useState("");
  const [simulated, setSimulated] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stealth, setStealth] = useState(false);
  const [ide, setIde] = useState(false);
  const [lastWire, setLastWire] = useState("");
  const [showWire, setShowWire] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const transportRef = useRef<ChatTransport | null>(null);
  const makeTransportRef = useRef(makeTransport);
  makeTransportRef.current = makeTransport;
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atBottomRef = useRef(true);

  // Live refs so the (stable) message handler always sees current UI state.
  const stealthRef = useRef(stealth);
  stealthRef.current = stealth;
  const ideRef = useRef(ide);
  ideRef.current = ide;
  const notifyRef = useRef(notifyOn);
  notifyRef.current = notifyOn;

  // restore notification preference
  useEffect(() => {
    setNotifyOn(localStorage.getItem("solink:notify") === "1" && notifyPermission() === "granted");
  }, []);

  async function toggleNotify() {
    if (notifyOn) {
      setNotifyOn(false);
      localStorage.setItem("solink:notify", "0");
      return;
    }
    const perm = await requestNotifyPermission();
    const on = perm === "granted";
    setNotifyOn(on);
    localStorage.setItem("solink:notify", on ? "1" : "0");
  }

  const messages = (activeContact && messagesByContact[activeContact]) || [];
  const contactsKey = `solink:contacts:${myName.toLowerCase()}`;

  // load saved contacts for this identity
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(contactsKey) || "[]");
      if (Array.isArray(saved)) setContacts(saved.map((u: string) => ({ username: u })));
    } catch {
      /* ignore */
    }
  }, [contactsKey]);

  const persistContacts = useCallback(
    (list: Contact[]) => {
      localStorage.setItem(contactsKey, JSON.stringify(list.map((c) => c.username)));
    },
    [contactsKey]
  );

  // deep-link: open a chat from ?c= and apply the stealth-by-default preference (once)
  useEffect(() => {
    if (localStorage.getItem("solink:stealthDefault") === "1") setStealth(true);
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) connectTo(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the URL in sync with the open chat, so links are shareable/deep-linkable
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeContact) url.searchParams.set("c", activeContact);
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url.toString());
  }, [activeContact]);

  // one transport per active conversation
  useEffect(() => {
    if (!activeContact) return;
    setConnecting(true);
    setPeerName("");
    setSimulated(false);
    setError(null);
    setPeerTyping(false);
    setReplyingTo(null);

    const events: TransportEvents = {
      onPeer: (pn, sim) => {
        setPeerName(pn);
        setSimulated(sim);
        setConnecting(false);
      },
      onMessage: (raw, payload, mine) => {
        const { text, replyTo } = decodeMessage(raw);
        setPeerTyping(false);
        setMessagesByContact((prev) => {
          const list = prev[activeContact] || [];
          if (list.some((m) => m.id === payload.id)) return prev;
          return {
            ...prev,
            [activeContact]: [
              ...list,
              { id: payload.id, mine, text, ts: payload.ts, senderName: payload.senderName, replyTo },
            ],
          };
        });
        if (!mine) {
          setContacts((prev) =>
            prev.map((c) => (c.username === activeContact ? { ...c, lastText: text, online: true } : c))
          );
          // Notify when the tab isn't focused.
          if (typeof document !== "undefined" && document.hidden) {
            playPing();
            document.title = "● New message";
            if (notifyRef.current) {
              // Disguise-aware: hide sender + content while in stealth or panic mode.
              showMessageNotification(activeContact, text, stealthRef.current || ideRef.current);
            }
          }
        }
      },
      onWireLog: (raw) => setLastWire(raw),
      onError: (msg) => {
        setError(msg);
        setConnecting(false);
      },
      onTyping: (isTyping) => {
        setPeerTyping(isTyping);
        if (typingClear.current) clearTimeout(typingClear.current);
        if (isTyping) {
          // Safety auto-clear in case a "stopped typing" event is missed.
          typingClear.current = setTimeout(() => setPeerTyping(false), 4000);
        }
      },
    };

    const t = makeTransportRef.current(activeContact, events);
    transportRef.current = t;
    void t.start();
    return () => {
      t.destroy();
      transportRef.current = null;
    };
  }, [activeContact]);

  // Restore the (disguised) tab title when the user comes back.
  useEffect(() => {
    function onFocus() {
      document.title = "index.ts — Visual Studio Code";
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // global hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "." || e.code === "Period")) {
        e.preventDefault();
        setIde((v) => !v);
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        setStealth((v) => !v);
      }
      if (e.key === "Escape") setIde(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-scroll only when the user is already near the bottom (or just sent something).
  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, peerTyping]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < 80;
    setShowScrollBtn(dist > 240);
  }

  function scrollToBottom() {
    atBottomRef.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  async function send(text: string) {
    const t = transportRef.current;
    if (!t || !activeContact) return;
    const reply = replyingTo
      ? { id: replyingTo.id, preview: replyingTo.text.slice(0, 90), mine: replyingTo.mine }
      : undefined;
    atBottomRef.current = true;
    const payload = await t.send(encodeMessage(text, reply));
    if (!payload) return;
    setMessagesByContact((prev) => {
      const list = prev[activeContact] || [];
      if (list.some((m) => m.id === payload.id)) return prev;
      return {
        ...prev,
        [activeContact]: [
          ...list,
          { id: payload.id, mine: true, text, ts: payload.ts, senderName: myName, replyTo: reply },
        ],
      };
    });
    setContacts((prev) => prev.map((c) => (c.username === activeContact ? { ...c, lastText: text } : c)));
    setReplyingTo(null);
  }

  function connectTo(username: string) {
    const clean = username.trim();
    if (!clean || clean.toLowerCase() === myName.toLowerCase()) return;
    setContacts((prev) => {
      if (prev.some((c) => c.username.toLowerCase() === clean.toLowerCase())) return prev;
      const next = [{ username: clean }, ...prev];
      persistContacts(next);
      return next;
    });
    setActiveContact(clean);
  }

  if (ide) {
    return (
      <BossModeIDE messages={messages} peerName={peerName} onSend={send} onExit={() => setIde(false)} />
    );
  }

  return (
    <main className="flex h-screen overflow-hidden">
      <Sidebar
        myName={myName}
        contacts={contacts}
        activeContact={activeContact}
        onSelect={setActiveContact}
        onConnect={connectTo}
        onSignOut={onSignOut}
        className={`md:w-80 md:shrink-0 ${activeContact ? "hidden md:flex" : "flex"}`}
      />

      <section className={`relative min-w-0 flex-1 flex-col ${activeContact ? "flex" : "hidden md:flex"}`}>
        {!activeContact ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 text-5xl">🔗</div>
            <h2 className="mb-1 text-lg font-semibold text-brand-text">No chat selected</h2>
            <p className="max-w-xs text-sm text-brand-muted">
              Search a username in the sidebar to start an end-to-end encrypted conversation.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-brand-border bg-brand-surface/70 px-3 py-2.5 backdrop-blur sm:px-4">
              <button
                onClick={() => setActiveContact(null)}
                className="rounded-lg p-1.5 text-brand-muted hover:bg-white/5 md:hidden"
                aria-label="Back"
              >
                ←
              </button>
              <Avatar name={activeContact} size={40} online={!!peerName} bot={simulated} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-brand-text">{activeContact}</div>
                <div className="truncate font-mono text-[11px] text-brand-muted">
                  {error ? (
                    <span className="text-red-400">{error}</span>
                  ) : peerTyping ? (
                    <span className="text-brand-accent">typing…</span>
                  ) : connecting ? (
                    <span className="text-brand-faint">connecting…</span>
                  ) : simulated ? (
                    <span className="text-brand-accent">demo peer · encrypted</span>
                  ) : peerName ? (
                    <span className="text-brand-online">🔒 end-to-end encrypted</span>
                  ) : (
                    <span className="text-brand-faint">waiting for peer…</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={toggleNotify}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                    notifyOn ? "bg-brand-accent/20 text-brand-accent" : "text-brand-faint hover:bg-white/5"
                  }`}
                  title={notifyOn ? "Notifications on" : "Enable notifications"}
                >
                  {notifyOn ? "🔔" : "🔕"}
                </button>
                <button
                  onClick={() => setShowWire((v) => !v)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                    showWire ? "bg-white/5 text-brand-muted" : "text-brand-faint hover:bg-white/5"
                  }`}
                  title="Toggle the encrypted-wire preview"
                >
                  🛡
                </button>
                <button
                  onClick={() => setStealth((v) => !v)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                    stealth ? "bg-brand-accent text-white" : "bg-white/5 text-brand-muted hover:bg-white/10"
                  }`}
                  title="Stealth (Ctrl+Shift+,)"
                >
                  {stealth ? "🥷" : "🕶"}
                </button>
                <button
                  onClick={() => setIde(true)}
                  className="rounded-lg bg-white/5 px-2 py-1 text-xs font-medium text-brand-muted transition hover:bg-white/10"
                  title="Panic → IDE (Ctrl+Shift+.)"
                >
                  🚨
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              onScroll={onScroll}
              className={`flex-1 overflow-y-auto ${
                stealth ? "bg-ide-bg py-2" : "px-3 py-4 sm:px-5"
              }`}
            >
              {messages.length === 0 && !error && (
                <div className="mt-12 text-center text-sm text-brand-faint">
                  {stealth
                    ? "// no entries yet — tap a line to reveal"
                    : "Messages are encrypted before they leave this tab 🔒"}
                </div>
              )}
              {error && messages.length === 0 && (
                <div className="mx-auto mt-12 max-w-xs rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
                  {error}
                </div>
              )}
              {stealth
                ? messages.map((m, i) => (
                    <CodeSnippet key={m.id} id={m.id} text={m.text} mine={m.mine} lineNumber={i + 1} />
                  ))
                : messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const showDay = !prev || !sameDay(prev.ts, m.ts);
                    const grouped =
                      !!prev &&
                      prev.mine === m.mine &&
                      !showDay &&
                      m.ts - prev.ts < 5 * 60 * 1000;
                    return (
                      <div key={m.id}>
                        {showDay && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-full bg-brand-surface2/80 px-3 py-1 text-[11px] text-brand-muted">
                              {dayLabel(m.ts)}
                            </span>
                          </div>
                        )}
                        <MessageBubble msg={m} grouped={grouped} onReply={setReplyingTo} />
                      </div>
                    );
                  })}
              {!stealth && peerTyping && (
                <div className="mt-2">
                  <TypingDots />
                </div>
              )}
            </div>

            {showScrollBtn && !stealth && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-28 right-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-brand-border bg-brand-surface2 text-brand-text shadow-lg transition hover:bg-brand-surface"
                aria-label="Scroll to latest"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {showWire && lastWire && (
              <div className="flex items-center gap-2 border-t border-brand-border bg-black/30 px-4 py-1 font-mono text-[10px] text-brand-faint">
                <span className="text-brand-online/80">wire ▸</span>
                <span className="truncate">{lastWire.slice(0, 80)}…</span>
              </div>
            )}

            {replyingTo && (
              <div className="flex items-center gap-2 border-t border-brand-border bg-brand-surface/70 px-3 py-2 backdrop-blur">
                <div className="w-1 self-stretch rounded-full bg-brand-accent" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-brand-accent">
                    Replying to {replyingTo.mine ? "yourself" : activeContact}
                  </div>
                  <div className="truncate text-xs text-brand-muted">{replyingTo.text}</div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="rounded-full p-1 text-brand-muted hover:bg-white/10 hover:text-brand-text"
                  aria-label="Cancel reply"
                >
                  ✕
                </button>
              </div>
            )}

            <Composer
              onSend={send}
              onTyping={(t) => transportRef.current?.sendTyping?.(t)}
              disabled={!!error}
            />
          </>
        )}
      </section>
    </main>
  );
}
