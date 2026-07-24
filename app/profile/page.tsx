"use client";

import Link from "next/link";
import { useIdentity } from "@/lib/identity";
import { Avatar } from "@/components/Avatar";

export default function ProfilePage() {
  const id = useIdentity();

  return (
    <main className="slide-up mx-auto flex min-h-dvh max-w-xl flex-col p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] sm:p-6">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/settings" className="rounded-lg p-1.5 text-brand-muted hover:bg-white/5" aria-label="Back">
          ←
        </Link>
        <h1 className="text-xl font-semibold text-brand-text">Profile</h1>
      </header>

      <div className="flex flex-col items-center rounded-2xl border border-brand-border bg-brand-surface/70 p-8 text-center">
        <Avatar name={id.username || "?"} size={96} online />
        <div className="mt-4 text-2xl font-semibold text-brand-text">{id.username || "…"}</div>
        <div className="mt-1 flex items-center gap-1 text-sm text-brand-online">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-online" /> online
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-border bg-brand-surface/70">
        <div className="border-b border-brand-border px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-brand-faint">
            This device's encryption key
          </div>
          <div className="mt-1 font-mono text-sm tracking-wider text-brand-accent">
            {id.publicKeyFingerprint || "…"}
          </div>
          <div className="mt-1 text-[11px] text-brand-muted">
            Your private key never leaves this device. Share this fingerprint with a friend to
            verify no one is intercepting your chats.
          </div>
        </div>
        <div className="px-4 py-3 text-xs text-brand-muted">
          Avatar upload & cross-device key sync are coming soon.
        </div>
      </div>

      <Link
        href="/"
        className="mt-6 rounded-2xl bg-brand-accent py-3 text-center text-sm font-medium text-white transition hover:bg-brand-accentHover"
      >
        Back to chats
      </Link>
    </main>
  );
}
