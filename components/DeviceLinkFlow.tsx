"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptDeviceTransfer,
  exportPublicKey,
  persistKeyPair,
} from "@/lib/crypto";
import {
  cancelDeviceLink,
  confirmDeviceLink,
  deviceLinkCode,
  getDeviceLink,
  requestDeviceLink,
  type DeviceLinkRequest,
} from "@/lib/deviceLink";

export function DeviceLinkFlow({
  sb,
  accountId,
  accountPublicKey,
  candidateKeyPair,
  backupExists,
  onLinked,
  onSignOut,
}: {
  sb: SupabaseClient;
  accountId: string;
  accountPublicKey: string;
  candidateKeyPair: CryptoKeyPair;
  backupExists: boolean;
  onLinked: (keyPair: CryptoKeyPair) => void;
  onSignOut: () => void;
}) {
  const [request, setRequest] = useState<DeviceLinkRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function begin() {
    setBusy(true);
    setMessage(null);
    try {
      const publicKey = await exportPublicKey(candidateKeyPair.publicKey);
      setRequest(await requestDeviceLink(sb, accountId, publicKey));
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage(
        text.includes("DEVICE_LIMIT_REACHED")
          ? "This account already has five linked devices. Remove one from an existing device first."
          : "Could not start device linking. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!request || !["pending", "approved"].includes(request.status)) return;
    let stopped = false;
    let completing = false;
    const check = async () => {
      if (completing || stopped) return;
      try {
        const current = await getDeviceLink(sb, request.id);
        if (stopped) return;
        setRequest(current);
        if (current.status !== "approved" || !current.transfer_envelope) return;
        completing = true;
        const restored = await decryptDeviceTransfer(
          current.transfer_envelope,
          candidateKeyPair,
          accountId,
          current.id
        );
        if ((await exportPublicKey(restored.keyPair.publicKey)) !== accountPublicKey) {
          throw new Error("Transferred key does not match this account");
        }
        await confirmDeviceLink(sb, current.id, restored.confirmationToken);
        await persistKeyPair(restored.keyPair);
        onLinked(restored.keyPair);
      } catch (error) {
        completing = false;
        setMessage(error instanceof Error && error.message.includes("DEVICE_LIMIT_REACHED")
          ? "The five-device limit was reached before approval completed."
          : "Approval could not be completed. Retry without clearing this browser.");
      }
    };
    void check();
    const timer = window.setInterval(check, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [accountId, accountPublicKey, candidateKeyPair, onLinked, request, sb]);

  async function cancel() {
    if (request) await cancelDeviceLink(sb, request.id).catch(() => undefined);
    setRequest(null);
    setMessage(null);
  }

  if (request?.status === "denied" || request?.status === "cancelled") {
    return (
      <>
        <h1 className="mb-2 text-[22px] font-semibold text-brand-text">
          {request.status === "denied" ? "Link request denied" : "Link request expired"}
        </h1>
        <p className="text-sm text-brand-muted">
          Your encryption key was not changed. Start again when your other device is nearby.
        </p>
        <button onClick={cancel} className="mt-5 w-full rounded-xl bg-brand-accent py-2.5 font-medium text-white">Try again</button>
      </>
    );
  }

  if (!request) {
    return (
      <>
        <h1 className="mb-2 text-[22px] font-semibold text-brand-text">Link this device</h1>
        <p className="text-sm text-brand-muted">
          Approve this phone from a device where Solink already works. Your chats stay encrypted,
          and your key never appears unencrypted on our servers.
        </p>
        {message && <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-300">{message}</p>}
        <button onClick={begin} disabled={busy} className="mt-5 w-full rounded-xl bg-brand-accent py-2.5 font-medium text-white disabled:opacity-60">
          {busy ? "Starting…" : "Link with another device"}
        </button>
        {backupExists && (
          <a href="/profile?recover=1" className="mt-3 block w-full rounded-xl border border-brand-border py-2.5 text-center text-sm text-brand-muted hover:bg-white/5">
            Use recovery passphrase instead
          </a>
        )}
        <button onClick={onSignOut} className="mt-3 w-full text-center text-xs text-brand-faint">Sign out</button>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-[22px] font-semibold text-brand-text">Approve on your other device</h1>
      <p className="text-sm text-brand-muted">Open Solink → Settings → Linked devices, then approve this request.</p>
      <div className="mt-5 rounded-2xl border border-brand-border bg-black/25 p-4 text-center">
        <div className="text-xs uppercase tracking-widest text-brand-faint">Match this code</div>
        <div className="mt-2 font-mono text-3xl font-semibold tracking-[0.3em] text-brand-text">
          {deviceLinkCode(request.id, request.candidate_public_key)}
        </div>
        <div className="mt-2 text-xs text-brand-muted">{request.name} · expires in about 10 minutes</div>
      </div>
      {message && <p className="mt-3 text-xs text-red-300">{message}</p>}
      <p className="mt-4 text-center text-xs text-brand-faint">Waiting for approval…</p>
      <button onClick={cancel} className="mt-3 w-full rounded-xl border border-brand-border py-2.5 text-sm text-brand-muted">Cancel</button>
    </>
  );
}
