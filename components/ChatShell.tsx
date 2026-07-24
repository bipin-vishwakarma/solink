"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatTransport, TransportEvents } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { CodeSnippet } from "./CodeSnippet";
import { BossModeIDE } from "./BossModeIDE";
import { Sidebar, type Contact } from "./Sidebar";
import { Avatar } from "./Avatar";

export type TransportFactory = (
  peerUsername: string,
  events: TransportEvents
) => ChatTransport;

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
  const [draft, setDraft] = useState("");

  const transportRef = useRef<ChatTransport | null>(null);
  const makeTransportRef = useRef(makeTransport);
  makeTransportRef.current = makeTransport;
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // one transport per active conversation
  useEffect(() => {
    if (!activeContact) return;
    setConnecting(true);
    setPeerName("");
    setSimulated(false);
    setError(null);

    const events: TransportEvents = {
      onPeer: (pn, sim) => {
        setPeerName(pn);
        setSimulated(sim);
        setConnecting(false);
      },
      onMessage: (text, payload, mine) => {
        setMessagesByContact((prev) => {
          const list = prev[activeContact] || [];
          if (list.some((m) => m.id === payload.id)) return prev;
          return {
            ...prev,
            [activeContact]: [
              ...list,
              { id: payload.id, mine, text, ts: payload.ts, senderName: payload.senderName },
            ],
          };
        });
        if (!mine) {
          setContacts((prev) =>
            prev.map((c) => (c.username === activeContact ? { ...c, lastText: text, online: true } : c))
          );
        }
      },
      onWireLog: (raw) => setLastWire(raw),
      onError: (msg) => {
        setError(msg);
        setConnecting(false);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(text: string) {
    const t = transportRef.current;
    if (!t || !activeContact) return;
    const payload = await t.send(text);
    if (!payload) return;
    setMessagesByContact((prev) => {
      const list = prev[activeContact] || [];
      if (list.some((m) => m.id === payload.id)) return prev;
      return {
        ...prev,
        [activeContact]: [
          ...list,
          { id: payload.id, mine: true, text, ts: payload.ts, senderName: myName },
        ],
      };
    });
    setContacts((prev) => prev.map((c) => (c.username === activeContact ? { ...c, lastText: text } : c)));
  }

  function submitDraft() {
    const t = draft.trim();
    if (!t) return;
    send(t);
    setDraft("");
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

      <section className={`min-w-0 flex-1 flex-col ${activeContact ? "flex" : "hidden md:flex"}`}>
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
                <div className="font-mono text-[11px] text-brand-muted">
                  {error ? (
                    <span className="text-red-400">{error}</span>
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
              <button
                onClick={() => setShowWire((v) => !v)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  showWire ? "bg-white/5 text-brand-muted" : "text-brand-faint hover:bg-white/5"
                }`}
                title="Toggle the encrypted-wire preview"
              >
                🛡
              </button>
              <button
                onClick={() => setStealth((v) => !v)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                  stealth ? "bg-brand-accent text-white" : "bg-white/5 text-brand-muted hover:bg-white/10"
                }`}
                title="Ctrl+Shift+,"
              >
                {stealth ? "stealth on" : "stealth"}
              </button>
              <button
                onClick={() => setIde(true)}
                className="rounded-lg bg-white/5 px-3 py-1 text-xs font-medium text-brand-muted transition hover:bg-white/10"
                title="Ctrl+Shift+."
              >
                panic
              </button>
            </header>

            <div
              ref={scrollRef}
              className={`flex-1 overflow-y-auto ${
                stealth ? "bg-ide-bg py-2" : "space-y-2 px-3 py-4 sm:px-5"
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
                : messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            </div>

            {showWire && lastWire && (
              <div className="flex items-center gap-2 border-t border-brand-border bg-black/30 px-4 py-1 font-mono text-[10px] text-brand-faint">
                <span className="text-brand-online/80">wire ▸</span>
                <span className="truncate">{lastWire.slice(0, 80)}…</span>
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-brand-border bg-brand-surface/70 p-3 backdrop-blur">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitDraft()}
                placeholder="Type a message"
                className="flex-1 rounded-full border border-brand-border bg-black/25 px-4 py-2.5 text-brand-text outline-none focus:border-brand-accent"
              />
              <button
                onClick={submitDraft}
                className="grid h-11 w-11 place-items-center rounded-full bg-brand-accent text-white transition hover:bg-brand-accentHover"
                aria-label="Send"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
