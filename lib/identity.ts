"use client";

import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabaseClient";
import { getOrCreateKeyPair, exportPublicKey, bufToB64 } from "./crypto";

export interface Identity {
  loading: boolean;
  username: string | null;
  mode: "cloud" | "demo";
  publicKeyFingerprint: string | null;
}

async function fingerprint(): Promise<string> {
  const kp = await getOrCreateKeyPair();
  const b64 = await exportPublicKey(kp.publicKey);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b64));
  const hex = bufToB64(digest)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16)
    .toUpperCase();
  // group into readable blocks
  return hex.match(/.{1,4}/g)?.join(" ") ?? hex;
}

/** Resolve the current user's identity in either Demo or Cloud mode. */
export function useIdentity(): Identity {
  const [state, setState] = useState<Identity>({
    loading: true,
    username: null,
    mode: hasSupabase ? "cloud" : "demo",
    publicKeyFingerprint: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const fp = await fingerprint().catch(() => null);
      if (!hasSupabase) {
        if (!alive) return;
        setState({
          loading: false,
          username: localStorage.getItem("solink:name"),
          mode: "demo",
          publicKeyFingerprint: fp,
        });
        return;
      }
      const { data } = await supabase!.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) {
        if (alive) setState({ loading: false, username: null, mode: "cloud", publicKeyFingerprint: fp });
        return;
      }
      const { data: prof } = await supabase!
        .from("profiles")
        .select("username")
        .eq("id", uid)
        .maybeSingle();
      if (alive)
        setState({
          loading: false,
          username: prof?.username ?? null,
          mode: "cloud",
          publicKeyFingerprint: fp,
        });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

export async function signOut() {
  if (hasSupabase) {
    await supabase!.auth.signOut();
  } else {
    localStorage.removeItem("solink:name");
  }
  window.location.href = "/";
}
