"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/appVersion";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function UpdateNotice() {
  const [available, setAvailable] = useState(false);

  const check = useCallback(async () => {
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { version?: string };
      if (data.version && data.version !== APP_VERSION) setAvailable(true);
    } catch {
      // Update checks are optional and must never interrupt messaging.
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  if (!available) return null;

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-brand-border bg-brand-surface px-4 py-3 shadow-2xl">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-text">Solink update available</p>
        <p className="text-xs text-brand-muted">Refresh to get the latest fixes and features.</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="pressable shrink-0 rounded-xl bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accentHover"
      >
        Update
      </button>
    </div>
  );
}
