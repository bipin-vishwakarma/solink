import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountSettings = {
  theme: "dark" | "light" | "system";
  stealthDefault: boolean;
  autoStealth: boolean;
  messageNotifications: boolean;
  readReceipts: boolean;
  presenceVisibility: "nobody" | "contacts" | "everyone";
};

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  theme: "dark",
  stealthDefault: false,
  autoStealth: false,
  messageNotifications: true,
  readReceipts: true,
  presenceVisibility: "contacts",
};

function parse(row: Record<string, unknown> | null): AccountSettings {
  if (!row) return DEFAULT_ACCOUNT_SETTINGS;
  return {
    theme: row.theme === "light" || row.theme === "system" ? row.theme : "dark",
    stealthDefault: row.stealth_default === true,
    autoStealth: row.auto_stealth === true,
    messageNotifications: row.message_notifications !== false,
    readReceipts: row.read_receipts !== false,
    presenceVisibility:
      row.presence_visibility === "nobody" || row.presence_visibility === "everyone"
        ? row.presence_visibility
        : "contacts",
  };
}

export async function getAccountSettings(sb: SupabaseClient): Promise<AccountSettings> {
  const { data, error } = await sb.rpc("get_my_account_settings");
  if (error) throw error;
  return parse(data as Record<string, unknown> | null);
}

export async function saveAccountSettings(sb: SupabaseClient, settings: AccountSettings) {
  const { data, error } = await sb.rpc("update_my_account_settings", {
    new_theme: settings.theme,
    new_stealth_default: settings.stealthDefault,
    new_auto_stealth: settings.autoStealth,
    new_message_notifications: settings.messageNotifications,
    new_read_receipts: settings.readReceipts,
    new_presence_visibility: settings.presenceVisibility,
  });
  if (error) throw error;
  return parse(data as Record<string, unknown> | null);
}

export function cacheAccountSettings(settings: AccountSettings) {
  localStorage.setItem("solink:theme", settings.theme);
  localStorage.setItem("solink:stealthDefault", settings.stealthDefault ? "1" : "0");
  localStorage.setItem("solink:autoStealth", settings.autoStealth ? "1" : "0");
  localStorage.setItem("solink:accountNotify", settings.messageNotifications ? "1" : "0");
  localStorage.setItem("solink:readReceipts", settings.readReceipts ? "1" : "0");
}
