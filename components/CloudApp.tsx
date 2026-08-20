"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, type Profile } from "@/lib/supabaseClient";
import { getOrCreateKeyPair, exportPublicKey } from "@/lib/crypto";
import { classifyDeviceKey, type DeviceKeyState } from "@/lib/deviceKeyState";
import { registerCurrentDevice, startDeviceHeartbeat } from "@/lib/deviceRegistry";
import { SupabaseTransport, type CloudContext } from "@/lib/supabaseTransport";
import { GroupTransport, type GroupContext, type GroupEvents } from "@/lib/groupTransport";
import type { InboxActivity } from "@/lib/types";
import { ChatShell, type TransportFactory } from "./ChatShell";
import { LogoMark } from "./Logo";
import { DeviceLinkFlow } from "./DeviceLinkFlow";

type Phase =
  | "loading"
  | "signedout"
  | "needs-username"
  | "device-recovery"
  | "device-limit"
  | "ready";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-brand-border bg-brand-surface/80 p-7 shadow-2xl backdrop-blur">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-text">
          <LogoMark size={22} /> Solink
          <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] font-normal text-brand-faint">
            cloud
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}

export function CloudApp() {
  const sb = supabase as SupabaseClient; // CloudApp only renders when configured
  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deviceKeyState, setDeviceKeyState] = useState<DeviceKeyState | null>(null);
  const [backupExists, setBackupExists] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function handleUser(id: string | null) {
      if (!mounted) return;
      setUserId(id);
      if (!id) {
        setProfile(null);
        setPhase("signedout");
        return;
      }
      const kp = await getOrCreateKeyPair();
      if (!mounted) return;
      setKeyPair(kp);
      const { data: prof, error: profileError } = await sb
        .from("profiles")
        .select("id, username, public_key, avatar_url")
        .eq("id", id)
        .maybeSingle();
      if (!mounted) return;
      if (profileError) {
        setErr("Could not verify your account. Check your connection and try again.");
        setPhase("device-recovery");
        return;
      }
      if (prof && prof.username) {
        try {
          const pub = await exportPublicKey(kp.publicKey);
          const { data: backup, error: backupError } = await sb
            .from("key_backups")
            .select("user_id")
            .eq("user_id", id)
            .maybeSingle();
          if (backupError) throw backupError;
          const keyState = classifyDeviceKey(pub, prof.public_key, !!backup);
          setBackupExists(!!backup);
          setDeviceKeyState(keyState);
          if (keyState !== "matching") {
            // Never replace an established account key just because Google SSO
            // succeeded on a fresh browser. That would strand old history and
            // race every other logged-in device. Recovery must prove possession
            // of the established E2EE key.
            setProfile(prof as Profile);
            setPhase("device-recovery");
            return;
          }
          const registration = await registerCurrentDevice(sb, kp, id);
          if (registration.limitReached) {
            setProfile(prof as Profile);
            setPhase("device-limit");
            return;
          }
          if (registration.error) {
            setErr("Could not register this device. Check your connection and try again.");
            setProfile(prof as Profile);
            setPhase("device-limit");
            return;
          }
        } catch {
          setErr("Could not verify this device's encryption key. Try again.");
          setPhase("device-recovery");
          return;
        }
        if (!mounted) return;
        setProfile(prof as Profile);
        setPhase("ready");
      } else {
        setPhase("needs-username");
      }
    }

    sb.auth.getSession().then(({ data }) => handleUser(data.session?.user?.id ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) =>
      handleUser(session?.user?.id ?? null)
    );
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  useEffect(() => {
    if (phase !== "ready" || !userId) return;
    return startDeviceHeartbeat(sb, userId);
  }, [phase, sb, userId]);

  const makeTransport = useCallback<TransportFactory>(
    (peer, events) => {
      const ctx: CloudContext = {
        supabase: sb,
        userId: userId as string,
        username: (profile as Profile).username,
        keyPair: keyPair as CryptoKeyPair,
      };
      return new SupabaseTransport(peer, events, ctx);
    },
    [sb, userId, profile, keyPair]
  );

  // Global inbox listener: fires for a new message in ANY of my conversations
  // (RLS limits it to mine). Separate channel from the chat transport, so it can
  // never affect message delivery. Resolves the sender's username for the UI.
  const makeInboxSubscription = useCallback(
    (onActivity: (a: InboxActivity) => void) => {
      const nameCache = new Map<string, string>();
      const ch = sb
        .channel(`inbox:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          async (payload) => {
            const row = payload.new as { sender_id: string; created_at: string };
            if (!row || row.sender_id === userId) return;
            let uname = nameCache.get(row.sender_id);
            if (!uname) {
              const { data } = await sb
                .from("profiles")
                .select("username")
                .eq("id", row.sender_id)
                .maybeSingle();
              uname = data?.username ?? undefined;
              if (uname) nameCache.set(row.sender_id, uname);
            }
            if (uname) onActivity({ fromUsername: uname, ts: new Date(row.created_at).getTime() });
          }
        )
        .subscribe();
      return () => {
        void sb.removeChannel(ch);
      };
    },
    [sb, userId]
  );

  const makeGroupTransport = useCallback(
    (groupId: string, events: GroupEvents) => {
      const ctx: GroupContext = {
        supabase: sb,
        userId: userId as string,
        username: (profile as Profile).username,
        keyPair: keyPair as CryptoKeyPair,
      };
      return new GroupTransport(groupId, events, ctx);
    },
    [sb, userId, profile, keyPair]
  );

  // The user's groups (RLS scopes the query to groups they belong to).
  const listGroups = useCallback(async () => {
    const { data } = await sb.from("groups").select("id, name").order("created_at", { ascending: false });
    return ((data as { id: string; name: string }[] | null) || []);
  }, [sb]);

  // Create a group, seed the creator as the first member, then add the rest.
  const createGroup = useCallback(
    async (name: string, memberUsernames: string[]) => {
      if (!userId) return null;
      const { data: g, error } = await sb
        .from("groups")
        .insert({ name: name.trim() || "Group", created_by: userId })
        .select("id, name")
        .single();
      if (error || !g) return null;
      await sb.from("group_members").insert({ group_id: g.id, user_id: userId });
      if (memberUsernames.length) {
        const { data: profs } = await sb
          .from("profiles")
          .select("id, username")
          .in("username", memberUsernames);
        const ids = ((profs as { id: string }[] | null) || [])
          .map((p) => p.id)
          .filter((pid) => pid !== userId);
        if (ids.length)
          await sb.from("group_members").insert(ids.map((pid) => ({ group_id: g.id, user_id: pid })));
      }
      return g as { id: string; name: string };
    },
    [sb, userId]
  );

  // Only let users start a chat with a username that actually exists.
  const validateUsername = useCallback(
    async (u: string) => {
      const { data } = await sb.from("profiles").select("id").ilike("username", u).maybeSingle();
      return !!data;
    },
    [sb]
  );

  // Look up a single user (case-insensitive) → canonical username + avatar, or null.
  const lookupUser = useCallback(
    async (u: string) => {
      const { data } = await sb
        .from("profiles")
        .select("username, avatar_url")
        .ilike("username", u)
        .maybeSingle();
      return data
        ? { username: data.username as string, avatarUrl: (data.avatar_url as string | null) ?? null }
        : null;
    },
    [sb]
  );

  // Batch-fetch avatars for a set of usernames (case-insensitive, one query).
  // Usernames are validated [a-zA-Z0-9_], so they're safe to inline in the filter.
  const fetchProfiles = useCallback(
    async (usernames: string[]) => {
      const clean = usernames.filter((u) => /^[a-zA-Z0-9_]{1,32}$/.test(u));
      if (!clean.length) return [];
      const filter = clean.map((u) => `username.ilike.${u}`).join(",");
      const { data } = await sb.from("profiles").select("username, avatar_url").or(filter);
      return ((data as { username: string; avatar_url: string | null }[] | null) || []).map((p) => ({
        username: p.username,
        avatarUrl: p.avatar_url ?? null,
      }));
    },
    [sb]
  );

  function signIn() {
    void sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signOut() {
    await sb.auth.signOut();
    setProfile(null);
    setPhase("signedout");
  }

  async function createProfile() {
    const uname = usernameDraft.trim();
    if (!uname || !userId) return;
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(uname)) {
      setErr("2–20 chars: letters, numbers, underscore");
      return;
    }
    setBusy(true);
    setErr(null);
    const kp = keyPair || (await getOrCreateKeyPair());
    const pub = await exportPublicKey(kp.publicKey);
    const { error } = await sb
      .from("profiles")
      .insert({ id: userId, username: uname, public_key: pub });
    setBusy(false);
    if (error) {
      setErr(error.code === "23505" ? "That username is taken" : error.message);
      return;
    }
    const registration = await registerCurrentDevice(sb, kp, userId);
    if (registration.limitReached || registration.error) {
      setErr(
        registration.limitReached
          ? "This account already has five active devices."
          : "Your profile was created, but this device could not be registered. Try again."
      );
      setProfile({ id: userId, username: uname, public_key: pub });
      setPhase("device-limit");
      return;
    }
    setProfile({ id: userId, username: uname, public_key: pub });
    setPhase("ready");
  }

  // ---------- render ----------
  if (phase === "loading") {
    return (
      <Card>
        <div className="py-6 text-center text-sm text-brand-muted">Loading…</div>
      </Card>
    );
  }

  if (phase === "signedout") {
    return (
      <Card>
        <h1 className="mb-2 text-[26px] font-semibold leading-tight text-brand-text">
          Encrypted chat,<br />disguised as code
        </h1>
        <p className="mb-6 text-sm text-brand-muted">
          Sign in to get a username and start end-to-end encrypted chats that sync across your
          sessions.
        </p>
        <button
          onClick={signIn}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-brand-border bg-white py-2.5 font-medium text-[#1f1f1f] transition hover:bg-white/90"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.5 7l7 5.4c4.1-3.8 6.2-9.4 6.2-16.9z" />
            <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.9-.8-4.3s.3-3 .8-4.3l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.6l-7-5.4c-2 1.4-4.6 2.2-8.2 2.2-6.3 0-11.7-3.8-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </button>
        <p className="mt-5 text-center font-mono text-[11px] text-brand-faint">
          Ctrl+Shift+.  panic (IDE) · Ctrl+Shift+,  stealth
        </p>
      </Card>
    );
  }

  if (phase === "needs-username") {
    return (
      <Card>
        <h1 className="mb-2 text-[22px] font-semibold text-brand-text">Pick a username</h1>
        <p className="mb-5 text-sm text-brand-muted">
          This is how friends find you. Your device also generates an encryption key now.
        </p>
        <div className="flex items-center rounded-xl border border-brand-border bg-black/25 px-3 focus-within:border-brand-accent">
          <span className="text-brand-faint">@</span>
          <input
            autoFocus
            value={usernameDraft}
            onChange={(e) => setUsernameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProfile()}
            placeholder="bipin"
            className="w-full bg-transparent px-2 py-2.5 text-brand-text outline-none"
          />
        </div>
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
        <button
          onClick={createProfile}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-brand-accent py-2.5 font-medium text-white transition hover:bg-brand-accentHover disabled:opacity-60"
        >
          {busy ? "Creating…" : "Claim username"}
        </button>
        <button
          onClick={signOut}
          className="mt-3 w-full text-center text-xs text-brand-faint hover:text-brand-muted"
        >
          sign out
        </button>
      </Card>
    );
  }

  if (phase === "device-recovery") {
    return (
      <Card>
        {userId && profile && keyPair ? (
          <DeviceLinkFlow
            sb={sb}
            accountId={userId}
            accountPublicKey={profile.public_key}
            candidateKeyPair={keyPair}
            backupExists={backupExists || deviceKeyState === "recovery-required"}
            onLinked={(restored) => {
              setKeyPair(restored);
              setDeviceKeyState("matching");
              setPhase("ready");
            }}
            onSignOut={signOut}
          />
        ) : (
          <>
            <h1 className="text-xl font-semibold text-brand-text">Could not verify this device</h1>
            <p className="mt-2 text-sm text-brand-muted">{err || "Check your connection and try again."}</p>
            <button onClick={signOut} className="mt-4 w-full rounded-xl border border-brand-border py-2.5 text-sm text-brand-muted">Sign out</button>
          </>
        )}
      </Card>
    );
  }

  if (phase === "device-limit") {
    return (
      <Card>
        <h1 className="mb-2 text-[22px] font-semibold text-brand-text">Device limit reached</h1>
        <p className="text-sm text-brand-muted">
          This account already has five active devices. Remove one in Settings, then return here
          to link this browser.
        </p>
        <a
          href="/settings?link=1"
          className="mt-5 block w-full rounded-xl bg-brand-accent py-2.5 text-center font-medium text-white transition hover:bg-brand-accentHover"
        >
          Manage linked devices
        </a>
        <button
          onClick={signOut}
          className="mt-3 w-full rounded-xl border border-brand-border py-2.5 text-sm text-brand-muted hover:bg-white/5"
        >
          Sign out
        </button>
      </Card>
    );
  }

  return (
    <ChatShell
      myName={(profile as Profile).username}
      myAvatarUrl={(profile as Profile).avatar_url}
      makeTransport={makeTransport}
      makeInboxSubscription={makeInboxSubscription}
      validateUsername={validateUsername}
      lookupUser={lookupUser}
      fetchProfiles={fetchProfiles}
      makeGroupTransport={makeGroupTransport}
      listGroups={listGroups}
      createGroup={createGroup}
      onSignOut={signOut}
    />
  );
}
