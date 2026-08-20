"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useIdentity, signOut } from "@/lib/identity";
import {
  requestNotifyPermission,
  notifyPermission,
  notifySupported,
} from "@/lib/notify";
import { isPushSupported, subscribeToPush } from "@/lib/push";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/lib/supabaseClient";
import {
  DEVICE_LIMIT,
  forgetInstallationId,
  getOrCreateInstallationId,
  listAccountDevices,
  renameAccountDevice,
  revokeAccountDevice,
  type AccountDevice,
} from "@/lib/deviceRegistry";
import { PendingDeviceLinks } from "@/components/PendingDeviceLinks";

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
  const router = useRouter();
  const id = useIdentity();
  const [notifyOn, setNotifyOn] = useState(false);
  const [stealthDefault, setStealthDefault] = useState(false);
  const [autoStealth, setAutoStealth] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);
  const [supported, setSupported] = useState(true); // assume supported for SSR match
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const currentInstallationId =
    typeof window === "undefined" || !id.userId
      ? ""
      : getOrCreateInstallationId(localStorage, id.userId);

  useEffect(() => {
    setSupported(notifySupported());
    setNotifyOn(localStorage.getItem("solink:notify") === "1" && notifyPermission() === "granted");
    setStealthDefault(localStorage.getItem("solink:stealthDefault") === "1");
    setAutoStealth(localStorage.getItem("solink:autoStealth") === "1");
    setLightTheme(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  async function refreshDevices() {
    if (!supabase || id.mode !== "cloud" || !id.userId) return;
    setDevicesBusy(true);
    setDevicesError(null);
    try {
      setDevices(await listAccountDevices(supabase));
    } catch {
      setDevicesError("Linked devices are unavailable until the device-registry migration is deployed.");
    } finally {
      setDevicesBusy(false);
    }
  }

  useEffect(() => {
    void refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id.mode, id.userId]);

  async function renameDevice(device: AccountDevice) {
    if (!supabase) return;
    const name = window.prompt("Device name", device.name)?.trim();
    if (!name || name === device.name) return;
    try {
      await renameAccountDevice(supabase, device.id, name, id.userId || undefined);
      await refreshDevices();
    } catch {
      setDevicesError("Could not rename that device.");
    }
  }

  async function removeDevice(device: AccountDevice) {
    if (!supabase) return;
    const current = device.id === currentInstallationId;
    const confirmed = window.confirm(
      current
        ? "Remove this device from Solink and sign out?"
        : `Remove ${device.name}? This frees one of your five device slots.`
    );
    if (!confirmed) return;
    try {
      await revokeAccountDevice(supabase, device.id);
      if (current) {
        forgetInstallationId(id.userId as string);
        await supabase.auth.signOut({ scope: "local" });
        router.push("/");
        return;
      }
      await refreshDevices();
    } catch {
      setDevicesError("Could not remove that device.");
    }
  }

  function toggleAutoStealth() {
    const v = !autoStealth;
    setAutoStealth(v);
    localStorage.setItem("solink:autoStealth", v ? "1" : "0");
  }

  function toggleTheme() {
    const v = !lightTheme;
    setLightTheme(v);
    localStorage.setItem("solink:theme", v ? "light" : "dark");
    if (v) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }

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
        {id.loading ? (
          <>
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2" aria-label="Loading profile">
              <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-40 animate-pulse rounded bg-white/5" />
            </div>
          </>
        ) : (
          <>
            <Avatar name={id.username || "?"} size={48} online src={id.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-brand-text">{id.username || "…"}</div>
              <div className="text-xs text-brand-muted">View profile · encryption key</div>
            </div>
          </>
        )}
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
        <Row title="Auto-stealth when I switch away" desc="Disguise as code when the tab loses focus; restore on return">
          <Toggle on={autoStealth} onChange={toggleAutoStealth} />
        </Row>
        <Row title="Light theme" desc="Switch between the warm dark and light look">
          <Toggle on={lightTheme} onChange={toggleTheme} />
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

      {id.mode === "cloud" && id.userId && supabase && (
        <PendingDeviceLinks sb={supabase} />
      )}

      {id.mode === "cloud" && id.userId && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-brand-border bg-brand-surface/70">
          <div className="flex items-center gap-3 border-b border-brand-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-brand-text">Linked devices</div>
              <div className="text-xs text-brand-muted">
                {devices.length} / {DEVICE_LIMIT} active device slots used
              </div>
            </div>
            <button
              onClick={() => void refreshDevices()}
              disabled={devicesBusy}
              className="rounded-lg border border-brand-border px-2.5 py-1.5 text-xs text-brand-muted hover:bg-white/5 disabled:opacity-50"
            >
              {devicesBusy ? "…" : "Refresh"}
            </button>
          </div>
          {devicesError && <p className="px-4 py-3 text-xs text-amber-300">{devicesError}</p>}
          {!devicesError && !devicesBusy && devices.length === 0 && (
            <p className="px-4 py-3 text-xs text-brand-muted">No registered devices yet.</p>
          )}
          <div className="divide-y divide-brand-border">
            {devices.map((device) => {
              const current = device.id === currentInstallationId;
              return (
                <div key={device.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-brand-text">
                        <span className="truncate">{device.name}</span>
                        {current && (
                          <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[10px] text-brand-accent">
                            this device
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-brand-muted">
                        {device.platform}
                      </div>
                      <div className="mt-0.5 text-[10px] text-brand-faint">
                        Last active {new Date(device.last_active_at).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => void renameDevice(device)}
                      className="text-xs text-brand-muted hover:text-brand-text"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => void removeDevice(device)}
                      className="text-xs text-red-300 hover:text-red-200"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="border-t border-brand-border px-4 py-3 text-[10px] text-brand-faint">
            Removing a device frees its slot and excludes it from future per-device key delivery.
            It does not yet end that browser&apos;s Supabase session and cannot erase downloaded messages.
          </p>
        </div>
      )}

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
