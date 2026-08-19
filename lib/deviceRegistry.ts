import type { SupabaseClient } from "@supabase/supabase-js";
import { exportPublicKey } from "./crypto";

export const DEVICE_LIMIT = 5;
const INSTALLATION_KEY = "solink:installation-id";

export interface AccountDevice {
  id: string;
  name: string;
  platform: string;
  public_key: string;
  key_version: number;
  created_at: string;
  last_active_at: string;
  revoked_at: string | null;
}

export function getOrCreateInstallationId(
  storage: Storage = localStorage,
  accountId?: string
): string {
  const key = accountId ? `${INSTALLATION_KEY}:${accountId}` : INSTALLATION_KEY;
  const existing = storage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(key, id);
  return id;
}

export function defaultDeviceName(userAgent: string): string {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(userAgent);
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  return `${browser} on ${mobile ? "mobile" : "computer"}`;
}

export function devicePlatform(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Web";
}

export function isDeviceLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; details?: unknown };
  return [candidate.message, candidate.details].some(
    (value) => typeof value === "string" && value.includes("DEVICE_LIMIT_REACHED")
  );
}

export async function registerCurrentDevice(
  sb: SupabaseClient,
  keyPair: CryptoKeyPair,
  accountId: string
): Promise<{ device: AccountDevice | null; limitReached: boolean; error?: string }> {
  const installationId = getOrCreateInstallationId(localStorage, accountId);
  const storedName = localStorage.getItem(`solink:device-name:${installationId}`);
  const name = storedName || defaultDeviceName(navigator.userAgent);
  const publicKey = await exportPublicKey(keyPair.publicKey);
  const { data, error } = await sb.rpc("register_account_device", {
    installation_id: installationId,
    device_name: name,
    device_platform: devicePlatform(navigator.userAgent),
    device_public_key: publicKey,
  });
  if (isDeviceLimitError(error)) return { device: null, limitReached: true };
  if (error) return { device: null, limitReached: false, error: error.message };
  return { device: data as AccountDevice, limitReached: false };
}

export async function listAccountDevices(sb: SupabaseClient): Promise<AccountDevice[]> {
  const { data, error } = await sb
    .from("account_devices")
    .select("id, name, platform, public_key, key_version, created_at, last_active_at, revoked_at")
    .is("revoked_at", null)
    .order("last_active_at", { ascending: false });
  if (error) throw error;
  return (data as AccountDevice[] | null) || [];
}

export async function renameAccountDevice(
  sb: SupabaseClient,
  installationId: string,
  name: string,
  accountId?: string
): Promise<void> {
  const clean = name.trim().slice(0, 48);
  if (!clean) throw new Error("Device name is required");
  const { error } = await sb.rpc("rename_account_device", {
    installation_id: installationId,
    device_name: clean,
  });
  if (error) throw error;
  if (accountId && installationId === getOrCreateInstallationId(localStorage, accountId)) {
    localStorage.setItem(`solink:device-name:${installationId}`, clean);
  }
}

export function startDeviceHeartbeat(
  sb: SupabaseClient,
  accountId: string
): () => void {
  const installationId = getOrCreateInstallationId(localStorage, accountId);
  let lastTouch = 0;
  const touch = () => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastTouch < 60_000) return;
    lastTouch = now;
    void sb.rpc("touch_account_device", { installation_id: installationId });
  };
  const timer = window.setInterval(touch, 5 * 60_000);
  document.addEventListener("visibilitychange", touch);
  window.addEventListener("online", touch);
  touch();
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", touch);
    window.removeEventListener("online", touch);
  };
}

export async function revokeAccountDevice(
  sb: SupabaseClient,
  installationId: string
): Promise<void> {
  const { error } = await sb.rpc("revoke_account_device", { installation_id: installationId });
  if (error) throw error;
}
