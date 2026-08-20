import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeviceTransferEnvelope } from "./crypto";
import { defaultDeviceName, devicePlatform, getOrCreateInstallationId } from "./deviceRegistry";

export type DeviceLinkStatus = "pending" | "approved" | "denied" | "cancelled" | "consumed";

export interface DeviceLinkRequest {
  id: string;
  name: string;
  platform: string;
  candidate_public_key: string;
  status: DeviceLinkStatus;
  created_at: string;
  expires_at: string;
  transfer_envelope?: DeviceTransferEnvelope | null;
}

export function deviceLinkCode(requestId: string, candidatePublicKey: string): string {
  let hash = 2166136261;
  const input = `${requestId}:${candidatePublicKey}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0).padStart(10, "0").slice(0, 6);
}

export async function requestDeviceLink(
  sb: SupabaseClient,
  accountId: string,
  candidatePublicKey: string
): Promise<DeviceLinkRequest> {
  const { data, error } = await sb.rpc("request_device_link", {
    installation_id: getOrCreateInstallationId(localStorage, accountId),
    device_name: defaultDeviceName(navigator.userAgent),
    device_platform: devicePlatform(navigator.userAgent),
    candidate_public_key: candidatePublicKey,
  });
  if (error) throw error;
  return data as DeviceLinkRequest;
}

export async function getDeviceLink(
  sb: SupabaseClient,
  requestId: string
): Promise<DeviceLinkRequest> {
  const { data, error } = await sb.rpc("get_device_link", { link_request_id: requestId });
  if (error) throw error;
  return data as DeviceLinkRequest;
}

export async function listPendingDeviceLinks(sb: SupabaseClient): Promise<DeviceLinkRequest[]> {
  const { data, error } = await sb.rpc("list_pending_device_links");
  if (error) throw error;
  return (data as DeviceLinkRequest[] | null) || [];
}

export async function approveDeviceLink(
  sb: SupabaseClient,
  requestId: string,
  envelope: DeviceTransferEnvelope,
  confirmationToken: string
): Promise<void> {
  const tokenHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(confirmationToken)
  );
  const hash = Array.from(new Uint8Array(tokenHash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { error } = await sb.rpc("approve_device_link", {
    link_request_id: requestId,
    transfer_payload: envelope,
    confirmation_token_hash: hash,
  });
  if (error) throw error;
}

export async function denyDeviceLink(sb: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await sb.rpc("deny_device_link", { link_request_id: requestId });
  if (error) throw error;
}

export async function confirmDeviceLink(
  sb: SupabaseClient,
  requestId: string,
  confirmationToken: string
): Promise<void> {
  const tokenHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(confirmationToken)
  );
  const hash = Array.from(new Uint8Array(tokenHash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { error } = await sb.rpc("confirm_device_link", {
    link_request_id: requestId,
    confirmation_token_hash: hash,
  });
  if (error) throw error;
}

export async function cancelDeviceLink(sb: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await sb.rpc("cancel_device_link", { link_request_id: requestId });
  if (error) throw error;
}
