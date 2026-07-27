"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIdentity } from "@/lib/identity";
import { supabase } from "@/lib/supabaseClient";
import { Avatar } from "@/components/Avatar";
import { QRCode } from "@/components/QRCode";

export default function ProfilePage() {
  const id = useIdentity();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvatarUrl(id.avatarUrl);
  }, [id.avatarUrl]);

  async function uploadAvatar(file: File) {
    if (!id.userId || !supabase) return;
    if (file.size > 5 * 1024 * 1024) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${id.userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) return;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", id.userId);
      setAvatarUrl(url);
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
                  if (f) uploadAvatar(f);
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
          Cross-device key sync is coming soon.
        </div>
      </div>

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
    </main>
  );
}
