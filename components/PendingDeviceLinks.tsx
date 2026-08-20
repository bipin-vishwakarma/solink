"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptDeviceTransfer, getOrCreateKeyPair } from "@/lib/crypto";
import {
  approveDeviceLink,
  denyDeviceLink,
  deviceLinkCode,
  listPendingDeviceLinks,
  type DeviceLinkRequest,
} from "@/lib/deviceLink";

export function PendingDeviceLinks({ sb }: { sb: SupabaseClient }) {
  const [requests, setRequests] = useState<DeviceLinkRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setRequests(await listPendingDeviceLinks(sb));
      setError(null);
    } catch {
      setRequests([]);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve(request: DeviceLinkRequest) {
    const code = deviceLinkCode(request.id, request.candidate_public_key);
    if (!window.confirm(`Approve ${request.name}? Confirm code ${code} is shown on the new device.`)) return;
    try {
      const token = crypto.randomUUID();
      const envelope = await encryptDeviceTransfer(
        await getOrCreateKeyPair(),
        request.candidate_public_key,
        (await sb.auth.getUser()).data.user?.id as string,
        request.id,
        token
      );
      await approveDeviceLink(sb, request.id, envelope, token);
      await refresh();
    } catch (approvalError) {
      const detail = approvalError instanceof Error ? approvalError.message : "";
      setError(
        detail.includes("LINK_REQUEST_UNAVAILABLE")
          ? "This request was already handled or expired. Ask the new device to try again."
          : detail.includes("ACTIVE_DEVICE_REQUIRED")
            ? "This browser is not registered as an active device. Reload Solink and try again."
            : `Could not approve this device${detail ? `: ${detail}` : ". Try again."}`
      );
      await refresh();
    }
  }

  async function deny(request: DeviceLinkRequest) {
    try {
      await denyDeviceLink(sb, request.id);
      await refresh();
    } catch {
      setError("Could not deny this request.");
    }
  }

  if (!requests.length && !error) return null;
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <div className="border-b border-amber-500/20 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-text">Device link requests</h2>
        <p className="text-xs text-brand-muted">Approve only when the code matches your new device.</p>
      </div>
      {error && <p className="px-4 py-3 text-xs text-red-300">{error}</p>}
      {requests.map((request) => (
        <div key={request.id} className="border-b border-brand-border px-4 py-3 last:border-0">
          <div className="text-sm font-medium text-brand-text">{request.name}</div>
          <div className="mt-1 font-mono text-lg tracking-[0.25em] text-amber-200">
            {deviceLinkCode(request.id, request.candidate_public_key)}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => approve(request)} className="rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white">Approve</button>
            <button onClick={() => deny(request)} className="rounded-lg border border-brand-border px-3 py-1.5 text-xs text-brand-muted">Deny</button>
          </div>
        </div>
      ))}
    </section>
  );
}
