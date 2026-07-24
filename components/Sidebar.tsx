"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";

export interface Contact {
  username: string;
  lastText?: string;
  online?: boolean;
}

export function Sidebar({
  myName,
  contacts,
  activeContact,
  onSelect,
  onConnect,
  onSignOut,
  className = "",
}: {
  myName: string;
  contacts: Contact[];
  activeContact: string | null;
  onSelect: (username: string) => void;
  onConnect: (username: string) => void;
  onSignOut?: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const filtered = trimmed
    ? contacts.filter((c) => c.username.toLowerCase().includes(trimmed.toLowerCase()))
    : contacts;
  const exactExists = contacts.some(
    (c) => c.username.toLowerCase() === trimmed.toLowerCase()
  );

  function connect() {
    if (!trimmed) return;
    onConnect(trimmed);
    setQuery("");
  }

  return (
    <aside
      className={`flex w-full flex-col border-r border-brand-border bg-brand-surface/70 backdrop-blur ${className}`}
    >
      {/* profile header */}
      <div className="flex items-center gap-3 border-b border-brand-border px-4 py-3">
        <Avatar name={myName} size={38} online />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-brand-text">{myName}</div>
          <div className="flex items-center gap-1 text-[11px] text-brand-online/90">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-online" />
            online
          </div>
        </div>
        {onSignOut ? (
          <button
            onClick={onSignOut}
            className="rounded-lg px-2 py-1 text-xs text-brand-muted transition hover:bg-white/5 hover:text-brand-text"
            title="Sign out"
          >
            sign out
          </button>
        ) : (
          <span className="text-lg">🔗</span>
        )}
      </div>

      {/* search / connect by username */}
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-brand-border bg-black/20 px-3 py-2 focus-within:border-brand-accent">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-brand-muted">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connect()}
            placeholder="Connect by username…"
            className="w-full bg-transparent text-sm text-brand-text placeholder:text-brand-faint outline-none"
          />
        </div>
        {trimmed && !exactExists && (
          <button
            onClick={connect}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border border-brand-accent/40 bg-brand-accentSoft/60 px-3 py-2 text-left transition hover:bg-brand-accentSoft"
          >
            <Avatar name={trimmed} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-brand-text">@{trimmed}</div>
              <div className="text-[11px] text-brand-accent">tap to start an encrypted chat</div>
            </div>
            <span className="text-brand-accent">→</span>
          </button>
        )}
      </div>

      {/* contacts */}
      <div className="mt-1 flex-1 overflow-y-auto px-2 pb-3">
        <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-brand-faint">
          Chats
        </div>
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-brand-faint">
            No chats yet.<br />Search a username above to connect.
          </div>
        )}
        {filtered.map((c) => {
          const active = c.username === activeContact;
          return (
            <button
              key={c.username}
              onClick={() => onSelect(c.username)}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                active ? "bg-brand-accentSoft" : "hover:bg-white/5"
              }`}
            >
              <Avatar name={c.username} size={40} online={c.online} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-brand-text">{c.username}</div>
                <div className="truncate text-xs text-brand-muted">
                  {c.lastText || "Say hi 👋"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
