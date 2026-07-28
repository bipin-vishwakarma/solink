"use client";

import { useCallback, useEffect, useState } from "react";
import { LocalTransport } from "@/lib/localTransport";
import type { TransportEvents } from "@/lib/types";
import { ChatShell, type TransportFactory } from "./ChatShell";
import { LogoMark } from "./Logo";

function roomFor(a: string, b: string): string {
  return "dm:" + [a.toLowerCase(), b.toLowerCase()].sort().join("~");
}

export function DemoApp() {
  const [myName, setMyName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("solink:name");
    if (saved) setMyName(saved);
  }, []);

  const makeTransport = useCallback<TransportFactory>(
    (peer: string, events: TransportEvents) =>
      new LocalTransport(roomFor(myName || "", peer), events, myName || ""),
    [myName]
  );

  function chooseName() {
    const n = nameDraft.trim();
    if (!n) return;
    localStorage.setItem("solink:name", n);
    setMyName(n);
  }

  if (!myName) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl border border-brand-border bg-brand-surface/80 p-7 shadow-2xl backdrop-blur">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-text">
            <LogoMark size={22} /> Solink
            <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] font-normal text-brand-faint">
              demo mode
            </span>
          </div>
          <h1 className="mb-2 text-[26px] font-semibold leading-tight text-brand-text">
            Encrypted chat,<br />disguised as code
          </h1>
          <p className="mb-6 text-sm text-brand-muted">
            Pick a username. Open a second tab with a different name and search each other to
            meet in a private end-to-end encrypted room.
          </p>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-brand-faint">
            Your username
          </label>
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && chooseName()}
            placeholder="e.g. bipin"
            className="mb-4 w-full rounded-xl border border-brand-border bg-black/25 px-3.5 py-2.5 text-brand-text outline-none focus:border-brand-accent"
          />
          <button
            onClick={chooseName}
            className="w-full rounded-xl bg-brand-accent py-2.5 font-medium text-white transition hover:bg-brand-accentHover"
          >
            Enter Solink
          </button>
          <p className="mt-5 text-center font-mono text-[11px] text-brand-faint">
            Ctrl+Shift+.  panic (IDE) · Ctrl+Shift+,  stealth
          </p>
        </div>
      </main>
    );
  }

  return (
    <ChatShell
      myName={myName}
      makeTransport={makeTransport}
      onSignOut={() => {
        localStorage.removeItem("solink:name");
        setMyName(null);
      }}
    />
  );
}
