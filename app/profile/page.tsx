"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIdentity } from "@/lib/identity";
import { supabase } from "@/lib/supabaseClient";
import { Avatar } from "@/components/Avatar";
import { QRCode } from "@/components/QRCode";
import { ImageCropper } from "@/components/ImageCropper";
import {
  getOrCreateKeyPair,
  backupKeyPair,
  unwrapKeyPair,
  persistKeyPair,
  clearPersistedKeyPair,
  exportPublicKey,
} from "@/lib/crypto";

export default function ProfilePage() {
  const id = useIdentity();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- cross-device key backup ----
  const [backupExists, setBackupExists] = useState(false);
  const [kbBusy, setKbBusy] = useState(false);
  const [kbMsg, setKbMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [backupPass, setBackupPass] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    setAvatarUrl(id.avatarUrl);
  }, [id.avatarUrl]);

  useEffect(() => {
    const recovering = new URLSearchParams(window.location.search).get("recover") === "1";
    setRecoveryMode(recovering);
    setShowRestore(recovering);
  }, []);

  useEffect(() => {
    if (!id.userId || !supabase) return;
    supabase
      .from("key_backups")
      .select("user_id")
      .eq("user_id", id.userId)
      .maybeSingle()
      .then(({ data }) => setBackupExists(!!data));
  }, [id.userId]);

  async function createBackup() {
    if (!id.userId || !supabase) return;
    if (backupPass.length < 8) {
      setKbMsg({ kind: "err", text: "Use a passphrase of at least 8 characters." });
      return;
    }
    setKbBusy(true);
    setKbMsg(null);
    try {
      const kp = await getOrCreateKeyPair();
      const pub = await exportPublicKey(kp.publicKey);
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", id.userId)
        .maybeSingle();
      if (profileError || !profile?.public_key) {
        throw profileError || new Error("Account key unavailable");
      }
      if (profile.public_key !== pub) {
        setShowRestore(true);
        setKbMsg({
          kind: "err",
          text: "Restore this account's encryption key before creating or updating its backup.",
        });
        return;
      }
      const blob = await backupKeyPair(kp, backupPass);
      const { error } = await supabase
        .from("key_backups")
        .upsert({ user_id: id.userId, blob }, { onConflict: "user_id" });
      if (error) throw error;
      setBackupExists(true);
      setBackupPass("");
      setKbMsg({ kind: "ok", text: "Backup saved. Keep your passphrase safe — it can't be reset." });
    } catch {
      setKbMsg({ kind: "err", text: "Couldn't save the backup. Try again." });
    } finally {
      setKbBusy(false);
    }
  }

  async function restoreBackup() {
    if (!id.userId || !supabase) return;
    setKbBusy(true);
    setKbMsg(null);
    try {
      const { data } = await supabase
        .from("key_backups")
        .select("blob")
        .eq("user_id", id.userId)
        .maybeSingle();
      if (!data?.blob) {
        setKbMsg({ kind: "err", text: "No backup found for this account." });
        return;
      }
      const kp = await unwrapKeyPair(data.blob, restorePass); // throws on wrong passphrase
      // Verify before replacing IndexedDB. A stale or unrelated backup must not
      // destroy the current installation's working key.
      const pub = await exportPublicKey(kp.publicKey);
      const { data: profile } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", id.userId)
        .maybeSingle();
      if (!profile?.public_key || profile.public_key !== pub) {
        setKbMsg({ kind: "err", text: "This backup does not match the account's encryption key." });
        return;
      }
      const previous = await getOrCreateKeyPair();
      await persistKeyPair(kp);
      const { data: verified, error: verifyError } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", id.userId)
        .maybeSingle();
      if (verifyError || verified?.public_key !== pub) {
        if (recoveryMode) await clearPersistedKeyPair();
        else await persistKeyPair(previous);
        throw verifyError || new Error("Account key changed during recovery");
      }
      setKbMsg({ kind: "ok", text: "Key restored. Reloading…" });
      setTimeout(() => {
        // A full reload is required after replacing IndexedDB key material.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      }, 900);
    } catch {
      setKbMsg({ kind: "err", text: "Wrong passphrase, or the backup is unreadable." });
    } finally {
      setKbBusy(false);
    }
  }

  async function uploadAvatar(blob: Blob) {
    if (!id.userId || !supabase) return;
    setUploading(true);
    setAvatarMessage(null);
    let uploadedPath: string | null = null;
    try {
      const path = `${id.userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      uploadedPath = path;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", id.userId);
      if (profileError) throw profileError;
      setAvatarUrl(url);
      setAvatarMessage({ kind: "ok", text: "Profile photo updated." });
      if (avatarUrl) {
        try {
          const previous = new URL(avatarUrl);
          const marker = "/storage/v1/object/public/avatars/";
          const markerAt = previous.pathname.indexOf(marker);
          if (previous.origin === new URL(url).origin && markerAt >= 0) {
            const previousPath = decodeURIComponent(previous.pathname.slice(markerAt + marker.length));
            if (previousPath.startsWith(`${id.userId}/`) && previousPath !== path) {
              await supabase.storage.from("avatars").remove([previousPath]);
            }
          }
        } catch {
          // The profile update succeeded; stale-photo cleanup is best effort.
        }
      }
    } catch {
      if (uploadedPath) {
        await supabase.storage.from("avatars").remove([uploadedPath]);
      }
      setAvatarMessage({ kind: "err", text: "Couldn't update your profile photo. Try again." });
    } finally {
      setUploading(false);
    }
  }

  const canUpload = id.mode === "cloud" && !!id.userId;

  return (
    <main className="slide-up mx-auto flex min-h-dvh max-w-xl flex-col p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] sm:p-6">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/settings" className="rounded-lg p-1.5 text-brand-muted hover:bg-white/5" aria-label="Back">
          ←
        </Link>
        <h1 className="text-xl font-semibold text-brand-text">Profile</h1>
      </header>

      <div className="flex flex-col items-center rounded-2xl border border-brand-border bg-brand-surface/70 p-8 text-center">
        <div className="relative">
          <Avatar name={id.username || "?"} size={96} online src={avatarUrl} />
          {canUpload && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="pressable absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-brand-surface bg-brand-accent text-sm text-white shadow"
                title="Change photo"
                type="button"
              >
                {uploading ? "…" : "📷"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCropFile(f);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
            </>
          )}
        </div>
        <div className="mt-4 text-2xl font-semibold text-brand-text">{id.username || "…"}</div>
        <div className="mt-1 flex items-center gap-1 text-sm text-brand-online">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-online" /> online
        </div>
        {avatarMessage && (
          <div
            role="status"
            className={`mt-3 text-xs ${avatarMessage.kind === "ok" ? "text-brand-online" : "text-red-300"}`}
          >
            {avatarMessage.text}
          </div>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-border bg-brand-surface/70">
        <div className="border-b border-brand-border px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-brand-faint">
            This device&apos;s encryption key
          </div>
          <div className="mt-1 font-mono text-sm tracking-wider text-brand-accent">
            {id.publicKeyFingerprint || "…"}
          </div>
          <div className="mt-1 text-[11px] text-brand-muted">
            Your private key never leaves this device. Share this fingerprint with a friend to
            verify no one is intercepting your chats.
          </div>
        </div>
      </div>

      {canUpload && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-brand-border bg-brand-surface/70">
          <div className="border-b border-brand-border px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-brand-faint">
              Cross-device key backup
            </div>
            <div className="mt-1 text-[11px] text-brand-muted">
              Encrypt this device&apos;s key with a passphrase so you can restore it — and read
              your history — on another device. The passphrase never leaves your device and
              can&apos;t be reset, so don&apos;t lose it.
            </div>
          </div>

          <div className="space-y-3 px-4 py-3">
            {kbMsg && (
              <div className={`text-xs ${kbMsg.kind === "ok" ? "text-brand-online" : "text-red-400"}`}>
                {kbMsg.text}
              </div>
            )}

            {!showRestore && !recoveryMode ? (
              <>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={backupExists ? "text-brand-online" : "text-brand-faint"}>
                    {backupExists ? "✓ A backup exists for this account" : "No backup yet"}
                  </span>
                </div>
                <input
                  type="password"
                  value={backupPass}
                  onChange={(e) => setBackupPass(e.target.value)}
                  placeholder="Backup passphrase (min 8 chars)"
                  className="w-full rounded-xl border border-brand-border bg-black/25 px-3 py-2 text-sm text-brand-text outline-none focus:border-brand-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={createBackup}
                    disabled={kbBusy}
                    className="pressable flex-1 rounded-xl bg-brand-accent py-2 text-sm font-medium text-white transition hover:bg-brand-accentHover disabled:opacity-60"
                  >
                    {kbBusy ? "Working…" : backupExists ? "Update backup" : "Back up my key"}
                  </button>
                  <button
                    onClick={() => { setShowRestore(true); setKbMsg(null); }}
                    className="pressable rounded-xl border border-brand-border px-3 py-2 text-sm text-brand-muted hover:bg-white/5"
                  >
                    Restore
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] text-brand-muted">
                  Restoring replaces this device&apos;s key with your backed-up key.
                </div>
                <input
                  type="password"
                  value={restorePass}
                  onChange={(e) => setRestorePass(e.target.value)}
                  placeholder="Enter your backup passphrase"
                  className="w-full rounded-xl border border-brand-border bg-black/25 px-3 py-2 text-sm text-brand-text outline-none focus:border-brand-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={restoreBackup}
                    disabled={kbBusy || !restorePass}
                    className="pressable flex-1 rounded-xl bg-brand-accent py-2 text-sm font-medium text-white transition hover:bg-brand-accentHover disabled:opacity-60"
                  >
                    {kbBusy ? "Restoring…" : "Restore on this device"}
                  </button>
                  {!recoveryMode && <button
                    onClick={() => { setShowRestore(false); setKbMsg(null); }}
                    className="pressable rounded-xl border border-brand-border px-3 py-2 text-sm text-brand-muted hover:bg-white/5"
                  >
                    Cancel
                  </button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {id.username && (
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-brand-border bg-brand-surface/70 p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-faint">
            Scan to add me
          </div>
          <div className="rounded-xl bg-[#efe9df] p-2">
            <QRCode value={`https://solink-omega.vercel.app/?c=${encodeURIComponent(id.username)}`} size={176} />
          </div>
          <div className="mt-2 text-center text-[11px] text-brand-muted">
            A friend (already on Solink) scans this to start a chat with you
          </div>
        </div>
      )}

      <Link
        href="/"
        className="mt-6 rounded-2xl bg-brand-accent py-3 text-center text-sm font-medium text-white transition hover:bg-brand-accentHover"
      >
        Back to chats
      </Link>

      {cropFile && (
        <ImageCropper
          file={cropFile}
          aspect={1}
          lockAspect
          title="Crop profile photo"
          onCancel={() => setCropFile(null)}
          onDone={(blob) => {
            setCropFile(null);
            void uploadAvatar(blob);
          }}
        />
      )}
    </main>
  );
}
