import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateInstallationId } from "./deviceRegistry";

export type PresenceSnapshot = {
  status: "online" | "offline" | "unknown";
  lastSeen?: number;
};

export function startAccountPresence(sb: SupabaseClient, accountId: string): () => void {
  const installationId = getOrCreateInstallationId(localStorage, accountId);
  const touch = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void sb.rpc("touch_my_presence", { installation_id: installationId });
    }
  };
  touch();
  const timer = window.setInterval(touch, 30_000);
  window.addEventListener("online", touch);
  document.addEventListener("visibilitychange", touch);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("online", touch);
    document.removeEventListener("visibilitychange", touch);
  };
}

export async function loadAccountPresence(
  sb: SupabaseClient,
  targetUser: string
): Promise<PresenceSnapshot> {
  try {
    const { data, error } = await sb.rpc("get_account_presence", { target_user: targetUser });
    if (error) return { status: "unknown" };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.status !== "online" && row?.status !== "offline") return { status: "unknown" };
    return {
      status: row.status,
      lastSeen: row.last_seen ? new Date(row.last_seen).getTime() : undefined,
    };
  } catch {
    return { status: "unknown" };
  }
}
