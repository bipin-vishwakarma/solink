"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";

/** Create-a-group sheet: name it and pick members from contacts or type usernames. */
export function NewGroupModal({
  contacts,
  onCancel,
  onCreate,
}: {
  contacts: string[];
  onCancel: () => void;
  onCreate: (name: string, members: string[]) => Promise<boolean | void> | void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manualUser, setManualUser] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(u: string) {
    setError(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  }

  function addManualUser() {
    const clean = manualUser.trim().replace(/^@+/, "");
    if (!clean) return;
    setError(null);
    setPicked((prev) => new Set(prev).add(clean));
    setManualUser("");
  }

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onCreate(name.trim(), [...picked]);
      if (res === false) {
        setError("Could not create group. Please check member usernames.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setBusy(false);
    }
  }

  // Combined contacts + any manually typed users not in contacts
  const allAvailable = Array.from(new Set([...contacts, ...picked]));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
      <div
        className="slide-up flex max-h-[85%] w-full max-w-md flex-col rounded-t-3xl border border-brand-border bg-brand-surface p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-text">New group</h2>
          <button onClick={onCancel} className="pressable rounded-full p-1.5 text-brand-muted hover:bg-white/10" aria-label="Close">
            ✕
          </button>
        </div>

        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Group name"
          className="mb-3 w-full rounded-xl border border-brand-border bg-black/25 px-3 py-2.5 text-sm text-brand-text outline-none focus:border-brand-accent"
        />

        {/* Add member by username */}
        <div className="mb-3 flex gap-2">
          <input
            value={manualUser}
            onChange={(e) => setManualUser(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addManualUser();
              }
            }}
            placeholder="Add by username (e.g. alice)"
            className="min-w-0 flex-1 rounded-xl border border-brand-border bg-black/25 px-3 py-2 text-xs text-brand-text outline-none focus:border-brand-accent"
          />
          <button
            type="button"
            onClick={addManualUser}
            disabled={!manualUser.trim()}
            className="pressable rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-brand-text hover:bg-white/15 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-brand-faint">
          Members {picked.size > 0 ? `(${picked.size} selected)` : "(You will be Admin)"}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {allAvailable.length === 0 ? (
            <div className="py-6 text-center text-xs text-brand-faint">
              Type a username above to add members, or create a group with just yourself.
            </div>
          ) : (
            allAvailable.map((u) => {
              const on = picked.has(u);
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => toggle(u)}
                  className="pressable flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                >
                  <Avatar name={u} size={34} />
                  <span className="min-w-0 flex-1 truncate text-sm text-brand-text">@{u}</span>
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] ${
                      on ? "border-brand-accent bg-brand-accent text-white" : "border-brand-border text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || busy}
          className="pressable mt-3 w-full rounded-xl bg-brand-accent py-2.5 text-sm font-medium text-white transition hover:bg-brand-accentHover disabled:opacity-50"
        >
          {busy ? "Creating…" : picked.size > 0 ? `Create group (${picked.size + 1} members)` : "Create group"}
        </button>
      </div>
    </div>
  );
}
