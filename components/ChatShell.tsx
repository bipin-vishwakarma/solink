"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentRef, ChatMessage, ChatTransport, InboxActivity, ReactionSummary, TransportEvents } from "@/lib/types";
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
  myAvatarUrl,
  makeTransport,
  makeInboxSubscription,
  validateUsername,
  onSignOut,
}: {
  myName: string;
  myAvatarUrl?: string | null;
  makeTransport: TransportFactory;
  makeInboxSubscription?: (onActivity: (a: InboxActivity) => void) => () => void;
  validateUsername?: (username: string) => Promise<boolean>;
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
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [notifyOn, setNotifyOn] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reactionsByMsg, setReactionsByMsg] = useState<
    Record<string, Record<string, { emoji: string; mine: boolean }>>
  >({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const transportRef = useRef<ChatTransport | null>(null);
  const makeTransportRef = useRef(makeTransport);
  makeTransportRef.current = makeTransport;
  const inboxRef = useRef(makeInboxSubscription);
  inboxRef.current = makeInboxSubscription;
  const activeContactRef = useRef(activeContact);
  activeContactRef.current = activeContact;
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markedRef = useRef<Set<string>>(new Set());
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

  // LIVE INBOX: a global listener for messages in ANY of my conversations — drives
  // recent-on-top sorting, unread badges, and cross-chat notifications. Runs on a
  // separate channel from the chat transport, so it can never affect message delivery.
  useEffect(() => {
    if (!inboxRef.current) return;
    const unsub = inboxRef.current((a) => {
      const uname = a.fromUsername;
      const isActive = uname.toLowerCase() === (activeContactRef.current || "").toLowerCase();
      setContacts((prev) => {
        const exists = prev.some((c) => c.username.toLowerCase() === uname.toLowerCase());
        const next = exists
          ? prev.map((c) =>
              c.username.toLowerCase() === uname.toLowerCase()
                ? {
                    ...c,
                    online: true,
                    lastActivity: Math.max(c.lastActivity || 0, a.ts),
                    unread: isActive ? c.unread : (c.unread || 0) + 1,
                  }
                : c
            )
          : // auto-add an incoming chat from someone new
            [{ username: uname, lastActivity: a.ts, online: true, unread: isActive ? 0 : 1 }, ...prev];
        persistContacts(next);
        return next;
      });
      if (!isActive) {
        playPing();
        if (notifyRef.current) {
          showMessageNotification(uname, "sent you a message", stealthRef.current || ideRef.current);
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // clear a chat's unread badge when you open it
  useEffect(() => {
    if (!activeContact) return;
    setContacts((prev) =>
      prev.some((c) => c.username === activeContact && c.unread)
        ? prev.map((c) => (c.username === activeContact ? { ...c, unread: 0 } : c))
        : prev
    );
  }, [activeContact]);

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
    setPeerOnline(false);
    setPeerAvatar(null);
    setLastSeen(null);
    setReactionsByMsg({});
    markedRef.current = new Set();

    const events: TransportEvents = {
      onPeer: (pn, sim, avatarUrl) => {
        setPeerName(pn);
        setSimulated(sim);
        setPeerAvatar(avatarUrl ?? null);
        setConnecting(false);
      },
      onMessage: (raw, payload, mine) => {
        const { text, replyTo, attachment } = decodeMessage(raw);
        const preview = text || (attachment ? "📎 " + attachment.name : "");
        setPeerTyping(false);
        setMessagesByContact((prev) => {
          const list = prev[activeContact] || [];
          if (list.some((m) => m.id === payload.id)) return prev;
          return {
            ...prev,
            [activeContact]: [
              ...list,
              { id: payload.id, mine, text, ts: payload.ts, senderName: payload.senderName, replyTo, attachment },
            ],
          };
        });
        if (!mine) {
          setContacts((prev) =>
            prev.map((c) =>
              c.username === activeContact
                ? { ...c, lastText: preview, online: true, lastActivity: Math.max(c.lastActivity || 0, payload.ts) }
                : c
            )
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
      onRead: (ids) => {
        setMessagesByContact((prev) => {
          const list = prev[activeContact] || [];
          let changed = false;
          const next = list.map((m) => {
            if (m.mine && !m.read && ids.includes(m.id)) {
              changed = true;
              return { ...m, read: true };
            }
            return m;
          });
          return changed ? { ...prev, [activeContact]: next } : prev;
        });
      },
      onPresence: (online, seen) => {
        setPeerOnline(online);
        if (!online && seen) setLastSeen(seen);
      },
      onReaction: (messageId, reactorId, emoji, mine) => {
        setReactionsByMsg((prev) => {
          const cur = { ...(prev[messageId] || {}) };
          if (emoji) cur[reactorId] = { emoji, mine };
          else delete cur[reactorId];
          return { ...prev, [messageId]: cur };
        });
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

  // Auto-stealth: when you switch tabs / the window loses focus, disguise the chat
  // as code; restore your previous view when you return. Opt-in via Settings.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("solink:autoStealth") !== "1") return;
    let saved = false;
    const hide = () => {
      saved = stealthRef.current;
      setStealth(true);
    };
    const show = () => setStealth(saved);
    const onVis = () => (document.hidden ? hide() : show());
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Auto-scroll only when the user is already near the bottom (or just sent something).
  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, peerTyping]);

  // Mark the peer's messages as read while the chat is open and the tab is visible.
  useEffect(() => {
    if (!activeContact) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const list = messagesByContact[activeContact] || [];
    const unread = list.filter((m) => !m.mine && !markedRef.current.has(m.id)).map((m) => m.id);
    if (unread.length && transportRef.current?.markRead) {
      unread.forEach((id) => markedRef.current.add(id));
      transportRef.current.markRead(unread);
    }
  }, [messagesByContact, activeContact]);

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
    setContacts((prev) =>
      prev.map((c) => (c.username === activeContact ? { ...c, lastText: text, lastActivity: payload.ts } : c))
    );
    setReplyingTo(null);
  }

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  async function sendFile(file: File) {
    const t = transportRef.current;
    if (!t || !activeContact || !t.sendAttachment) return;
    const MAX = 15 * 1024 * 1024;
    if (file.size > MAX) {
      flash("File too large (max 15 MB)");
      return;
    }
    flash(`Encrypting ${file.name}…`);
    const bytes = await file.arrayBuffer();
    atBottomRef.current = true;
    const res = await t.sendAttachment(
      bytes,
      { name: file.name, mime: file.type || "application/octet-stream", size: file.size },
      ""
    );
    setNotice(null);
    if (!res) {
      flash("Couldn't send file");
      return;
    }
    setMessagesByContact((prev) => {
      const list = prev[activeContact] || [];
      if (list.some((m) => m.id === res.payload.id)) return prev;
      return {
        ...prev,
        [activeContact]: [
          ...list,
          { id: res.payload.id, mine: true, text: "", ts: res.payload.ts, senderName: myName, attachment: res.attachment },
        ],
      };
    });
    const preview = file.type.startsWith("audio/")
      ? "🎙️ Voice message"
      : file.type.startsWith("image/")
        ? "📷 Photo"
        : "📎 " + file.name;
    setContacts((prev) =>
      prev.map((c) => (c.username === activeContact ? { ...c, lastText: preview } : c))
    );
  }

  const resolveAttachment = useCallback((ref: AttachmentRef) => {
    const t = transportRef.current;
    return t?.resolveAttachment ? t.resolveAttachment(ref) : Promise.resolve(null);
  }, []);

  function aggregateReactions(messageId: string): ReactionSummary[] | undefined {
    const map = reactionsByMsg[messageId];
    if (!map) return undefined;
    const byEmoji: Record<string, { count: number; mine: boolean }> = {};
    for (const { emoji, mine } of Object.values(map)) {
      if (!byEmoji[emoji]) byEmoji[emoji] = { count: 0, mine: false };
      byEmoji[emoji].count++;
      if (mine) byEmoji[emoji].mine = true;
    }
    const arr = Object.entries(byEmoji).map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }));
    return arr.length ? arr : undefined;
  }

  function react(messageId: string, emoji: string) {
    const t = transportRef.current;
    if (!t?.sendReaction) return;
    const mineCur = Object.values(reactionsByMsg[messageId] || {}).find((r) => r.mine);
    const next = mineCur?.emoji === emoji ? "" : emoji;
    t.sendReaction(messageId, next);
  }

  async function connectTo(username: string): Promise<string | null> {
    const clean = username.trim();
    if (!clean) return null;
    if (clean.toLowerCase() === myName.toLowerCase()) return "That's your own username";
    // already a contact → just open it
    const existing = contacts.find((c) => c.username.toLowerCase() === clean.toLowerCase());
    if (existing) {
      setActiveContact(existing.username);
      return null;
    }
    // in cloud mode, only allow adding usernames that actually exist
    if (validateUsername) {
      const ok = await validateUsername(clean).catch(() => false);
      if (!ok) return `No user named @${clean}`;
    }
    setContacts((prev) => {
      if (prev.some((c) => c.username.toLowerCase() === clean.toLowerCase())) return prev;
      const next = [{ username: clean, lastActivity: Date.now() }, ...prev];
      persistContacts(next);
      return next;
    });
    setActiveContact(clean);
    return null;
  }

  if (ide) {
    return (
      <BossModeIDE messages={messages} peerName={peerName} onSend={send} onExit={() => setIde(false)} />
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden">
      <Sidebar
        myName={myName}
        myAvatarUrl={myAvatarUrl}
        contacts={[...contacts].sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))}
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
            <header className="flex items-center gap-3 border-b border-brand-border bg-brand-surface/70 px-3 pb-2.5 pt-[calc(0.625rem+var(--safe-top))] backdrop-blur sm:px-4">
              <button
                onClick={() => setActiveContact(null)}
                className="rounded-lg p-1.5 text-brand-muted hover:bg-white/5 md:hidden"
                aria-label="Back"
              >
                ←
              </button>
              <Avatar name={activeContact} size={40} online={peerOnline} bot={simulated} src={peerAvatar} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-brand-text">{activeContact}</div>
                <div className="truncate font-mono text-[11px] text-brand-muted">
                  {error ? (
                    <span className="text-red-400">{error}</span>
                  ) : peerTyping ? (
                    <span className="text-brand-accent">typing…</span>
                  ) : connecting ? (
                    <span className="text-brand-faint">connecting…</span>
                  ) : peerOnline ? (
                    <span className="text-brand-online">online</span>
                  ) : lastSeen ? (
                    <span className="text-brand-faint">
                      last seen {new Date(lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
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
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    setSearchQuery("");
                  }}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                    searchOpen ? "bg-brand-accent/20 text-brand-accent" : "text-brand-faint hover:bg-white/5"
                  }`}
                  title="Search messages"
                >
                  🔍
                </button>
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

            {searchOpen && (
              <div className="border-b border-brand-border bg-brand-surface/70 px-3 py-2 backdrop-blur">
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in this chat…"
                  className="w-full rounded-full border border-brand-border bg-black/25 px-4 py-2 text-sm text-brand-text outline-none focus:border-brand-accent"
                />
              </div>
            )}

            <div
              ref={scrollRef}
              onScroll={onScroll}
              className={`flex-1 overflow-y-auto overscroll-contain ${
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
              {searchOpen && searchQuery.trim() && !stealth && messages.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase())).length === 0 && (
                <div className="mt-10 text-center text-sm text-brand-faint">No messages match “{searchQuery.trim()}”</div>
              )}
              {stealth
                ? messages.map((m, i) => (
                    <CodeSnippet key={m.id} id={m.id} text={m.text} mine={m.mine} lineNumber={i + 1} />
                  ))
                : (searchOpen && searchQuery.trim()
                    ? messages.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                    : messages
                  ).map((m, i, arr) => {
                    const prev = arr[i - 1];
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
                        <MessageBubble
                          msg={m}
                          grouped={grouped}
                          onReply={setReplyingTo}
                          resolveAttachment={resolveAttachment}
                          reactions={aggregateReactions(m.id)}
                          onReact={(e) => react(m.id, e)}
                        />
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

            {notice && (
              <div className="border-t border-brand-border bg-brand-accent/10 px-4 py-1.5 text-center text-xs text-brand-accent">
                {notice}
              </div>
            )}

            <Composer
              onSend={send}
              onTyping={(t) => transportRef.current?.sendTyping?.(t)}
              onAttach={sendFile}
              disabled={!!error}
            />
          </>
        )}
      </section>
    </main>
  );
}
