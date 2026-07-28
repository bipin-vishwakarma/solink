"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";

/** Create-a-group sheet: name it and pick members from your existing contacts. */
export function NewGroupModal({
  contacts,
  onCancel,
  onCreate,
}: {
  contacts: string[];
  onCancel: () => void;
  onCreate: (name: string, members: string[]) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(u: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || picked.size === 0 || busy) return;
    setBusy(true);
    await onCreate(name.trim(), [...picked]);
    setBusy(false);
  }

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
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          className="mb-3 w-full rounded-xl border border-brand-border bg-black/25 px-3 py-2.5 text-sm text-brand-text outline-none focus:border-brand-accent"
        />

        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-brand-faint">
          Add members {picked.size > 0 && `(${picked.size})`}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {contacts.length === 0 ? (
            <div className="py-6 text-center text-xs text-brand-faint">
              Add some contacts first, then create a group.
            </div>
          ) : (
            contacts.map((u) => {
              const on = picked.has(u);
              return (
                <button
                  key={u}
                  onClick={() => toggle(u)}
                  className="pressable flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                >
                  <Avatar name={u} size={34} />
                  <span className="min-w-0 flex-1 truncate text-sm text-brand-text">{u}</span>
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

        <button
          onClick={submit}
          disabled={!name.trim() || picked.size === 0 || busy}
          className="pressable mt-3 w-full rounded-xl bg-brand-accent py-2.5 text-sm font-medium text-white transition hover:bg-brand-accentHover disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create group"}
        </button>
      </div>
    </div>
  );
}
