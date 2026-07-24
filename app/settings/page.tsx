"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useIdentity, signOut } from "@/lib/identity";
import {
  requestNotifyPermission,
  notifyPermission,
  notifySupported,
} from "@/lib/notify";
import { isPushSupported, subscribeToPush } from "@/lib/push";
import { Avatar } from "@/components/Avatar";

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-brand-text">{title}</div>
        {desc && <div className="text-xs text-brand-muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand-accent" : "bg-white/15"}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const id = useIdentity();
  const [notifyOn, setNotifyOn] = useState(false);
  const [stealthDefault, setStealthDefault] = useState(false);
  const [supported, setSupported] = useState(true); // assume supported for SSR match

  useEffect(() => {
    setSupported(notifySupported());
    setNotifyOn(localStorage.getItem("solink:notify") === "1" && notifyPermission() === "granted");
    setStealthDefault(localStorage.getItem("solink:stealthDefault") === "1");
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

  function toggleStealth() {
    const v = !stealthDefault;
    setStealthDefault(v);
    localStorage.setItem("solink:stealthDefault", v ? "1" : "0");
  }

  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  async function enablePush() {
    if (!id.userId) return;
    setPushBusy(true);
    setPushStatus(null);
    const res = await subscribeToPush(id.userId);
    setPushBusy(false);
    if (res.ok) setPushStatus("Enabled — you'll get notified even when Solink is closed.");
    else if (res.reason === "no-vapid-key") setPushStatus("Not configured yet (needs VAPID keys).");
    else if (res.reason === "denied") setPushStatus("Permission denied.");
    else if (res.reason === "unsupported") setPushStatus("Not supported on this browser.");
    else setPushStatus("Couldn't enable push.");
  }

  return (
    <main className="slide-up mx-auto flex min-h-dvh max-w-xl flex-col p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/" className="rounded-lg p-1.5 text-brand-muted hover:bg-white/5" aria-label="Back">
          ←
        </Link>
        <h1 className="text-xl font-semibold text-brand-text">Settings</h1>
      </header>

      {/* profile card */}
      <Link
        href="/profile"
        className="mb-4 flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-surface/70 p-4 transition hover:bg-brand-surface"
      >
        <Avatar name={id.username || "?"} size={48} online />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-brand-text">{id.username || "…"}</div>
          <div className="text-xs text-brand-muted">View profile · encryption key</div>
        </div>
        <span className="text-brand-faint">›</span>
      </Link>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-surface/70 divide-y divide-brand-border">
        <Row
          title="Notifications"
          desc={supported ? "Alert me when a message arrives" : "Not supported on this browser"}
        >
          <Toggle on={notifyOn} onChange={toggleNotify} />
        </Row>
        <Row title="Open chats in stealth by default" desc="Start every chat disguised as code">
          <Toggle on={stealthDefault} onChange={toggleStealth} />
        </Row>
        {id.mode === "cloud" && isPushSupported() && id.userId && (
          <Row title="Background push" desc={pushStatus || "Get notified even when Solink is closed"}>
            <button
              onClick={enablePush}
              disabled={pushBusy}
              className="rounded-lg bg-brand-accent/20 px-3 py-1.5 text-xs font-medium text-brand-accent transition hover:bg-brand-accent/30 disabled:opacity-50"
            >
              {pushBusy ? "…" : "Enable"}
            </button>
          </Row>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-border bg-brand-surface/70 divide-y divide-brand-border">
        <Row title="End-to-end encrypted" desc="Messages are encrypted on your device. The server only stores ciphertext.">
          <span className="text-lg">🔒</span>
        </Row>
        <Row title="Shortcuts" desc="Ctrl+Shift+.  panic (IDE) · Ctrl+Shift+,  stealth">
          <span className="text-lg">⌨️</span>
        </Row>
      </div>

      <button
        onClick={signOut}
        className="mt-6 w-full rounded-2xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
      >
        Sign out
      </button>

      <div className="mt-6 text-center font-mono text-[11px] text-brand-faint">
        Solink · {id.mode} mode
      </div>
    </main>
  );
}
