"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "./Avatar";

export interface Contact {
  username: string;
  lastText?: string;
  online?: boolean;
  unread?: number;
  lastActivity?: number; // ms timestamp of the latest message, for recent-on-top sorting
  avatarUrl?: string | null; // the peer's profile photo, if any
}

export function Sidebar({
  myName,
  myAvatarUrl,
  contacts,
  activeContact,
  onSelect,
  onConnect,
  onLookup,
  groups = [],
  activeGroupId = null,
  onSelectGroup,
  onNewGroup,
  className = "",
}: {
  myName: string;
  myAvatarUrl?: string | null;
  contacts: Contact[];
  activeContact: string | null;
  onSelect: (username: string) => void;
  onConnect: (username: string) => Promise<string | null>;
  onLookup?: (username: string) => Promise<{ username: string; avatarUrl: string | null } | null>;
  onSignOut?: () => void;
  groups?: { id: string; name: string }[];
  activeGroupId?: string | null;
  onSelectGroup?: (id: string) => void;
  onNewGroup?: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Live search preview of the looked-up user (avatar + canonical name).
  const [preview, setPreview] = useState<
    { status: "loading" } | { status: "found"; username: string; avatarUrl: string | null } | { status: "none" } | null
  >(null);

  const trimmed = query.trim();
  const filtered = trimmed
    ? contacts.filter((c) => c.username.toLowerCase().includes(trimmed.toLowerCase()))
    : contacts;
  const exactExists = contacts.some(
    (c) => c.username.toLowerCase() === trimmed.toLowerCase()
  );

  // Debounced lookup so the search card can show the real user's avatar.
  useEffect(() => {
    if (!onLookup || !trimmed || exactExists) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreview({ status: "loading" });
    const t = setTimeout(async () => {
      const found = await onLookup(trimmed).catch(() => null);
      if (cancelled) return;
      setPreview(found ? { status: "found", username: found.username, avatarUrl: found.avatarUrl } : { status: "none" });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, exactExists, onLookup]);

  async function connect() {
    if (!trimmed || connecting) return;
    setConnecting(true);
    setError(null);
    const err = await onConnect(trimmed);
    setConnecting(false);
    if (err) setError(err);
    else {
      setQuery("");
      setError(null);
    }
  }

  return (
    <aside
      className={`flex w-full flex-col border-r border-brand-border bg-brand-surface/70 backdrop-blur ${className}`}
    >
      {/* profile header */}
      <div className="flex items-center gap-3 border-b border-brand-border px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))]">
        <Link href="/profile" className="transition hover:opacity-80" title="Your profile">
          <Avatar name={myName} size={38} online src={myAvatarUrl} />
        </Link>
        <Link href="/profile" className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-brand-text">{myName}</div>
          <div className="flex items-center gap-1 text-[11px] text-brand-online/90">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-online" />
            online
          </div>
        </Link>
        <Link
          href="/settings"
          className="rounded-lg p-2 text-brand-muted transition hover:bg-white/5 hover:text-brand-text"
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.2.61.76 1.05 1.42 1.09H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </Link>
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
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && connect()}
            placeholder="Connect by username…"
            className="w-full bg-transparent text-sm text-brand-text placeholder:text-brand-faint outline-none"
          />
        </div>
        {error && <div className="mt-2 px-1 text-xs text-red-400">{error}</div>}
        {trimmed && !exactExists && !error && (
          // With onLookup (cloud) we show the real user's avatar + a not-found
          // state. Without it (demo) we fall back to a plain connect suggestion.
          onLookup ? (
            preview?.status === "found" ? (
              <button
                onClick={connect}
                disabled={connecting}
                className="mt-2 flex w-full items-center gap-3 rounded-xl border border-brand-accent/40 bg-brand-accentSoft/60 px-3 py-2 text-left transition hover:bg-brand-accentSoft disabled:opacity-60"
              >
                <Avatar name={preview.username} size={34} src={preview.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-brand-text">@{preview.username}</div>
                  <div className="text-[11px] text-brand-accent">
                    {connecting ? "connecting…" : "tap to start an encrypted chat"}
                  </div>
                </div>
                <span className="text-brand-accent">→</span>
              </button>
            ) : preview?.status === "loading" ? (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-brand-border bg-black/10 px-3 py-2">
                <div className="skeleton h-[34px] w-[34px] rounded-full" />
                <div className="text-[11px] text-brand-muted">searching…</div>
              </div>
            ) : preview?.status === "none" ? (
              <div className="mt-2 rounded-xl border border-brand-border bg-black/10 px-3 py-2 text-xs text-brand-faint">
                No user named <span className="text-brand-muted">@{trimmed}</span>
              </div>
            ) : null
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border border-brand-accent/40 bg-brand-accentSoft/60 px-3 py-2 text-left transition hover:bg-brand-accentSoft disabled:opacity-60"
            >
              <Avatar name={trimmed} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-brand-text">@{trimmed}</div>
                <div className="text-[11px] text-brand-accent">
                  {connecting ? "checking…" : "tap to start an encrypted chat"}
                </div>
              </div>
              <span className="text-brand-accent">→</span>
            </button>
          )
        )}
      </div>

      {/* contacts + groups */}
      <div className="mt-1 flex-1 overflow-y-auto px-2 pb-3">
        {onNewGroup && (
          <>
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-brand-faint">Groups</span>
              <button
                onClick={onNewGroup}
                className="pressable rounded-full px-2 py-0.5 text-[11px] font-medium text-brand-accent hover:bg-brand-accentSoft"
              >
                ＋ New
              </button>
            </div>
            {groups.map((g) => {
              const active = g.id === activeGroupId;
              return (
                <button
                  key={g.id}
                  onClick={() => onSelectGroup?.(g.id)}
                  className={`pressable mb-0.5 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                    active ? "bg-brand-accentSoft" : "hover:bg-white/5 active:bg-white/10"
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-accentSoft text-lg">
                    👥
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-text">{g.name}</span>
                </button>
              );
            })}
          </>
        )}
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
              className={`pressable flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                active ? "bg-brand-accentSoft" : "hover:bg-white/5 active:bg-white/10"
              }`}
            >
              <Avatar name={c.username} size={40} online={c.online} src={c.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-brand-text">{c.username}</div>
                <div className={`truncate text-xs ${c.unread ? "font-medium text-brand-text" : "text-brand-muted"}`}>
                  {c.lastText || "No messages yet"}
                </div>
              </div>
              {c.unread ? (
                <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-brand-accent px-1.5 text-[11px] font-semibold text-white">
                  {c.unread > 99 ? "99+" : c.unread}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
