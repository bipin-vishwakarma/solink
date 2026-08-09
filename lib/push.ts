"use client";

// Client-side push notification helpers for Solink.
// Registers the service worker, subscribes to Web Push, and stores the
// subscription in Supabase so the server can deliver notifications.

import { supabase, hasSupabase } from "@/lib/supabaseClient";

// Feature-detect Web Push support in the current environment.
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Convert a base64url VAPID public key into the Uint8Array the
// PushManager.subscribe() API expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Register the SW, request permission, subscribe, and persist the
// subscription for the given user. Returns a small result object rather
// than throwing.
export async function subscribeToPush(
  userId: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    // The VAPID public key is injected at build/runtime.
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      return { ok: false, reason: "no-vapid-key" };
    }

    // Register the service worker and wait until it is ready.
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Ask the user for notification permission.
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, reason: "denied" };
    }

    // Reuse an existing subscription, or create a new one.
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
    }

    // Persist the subscription in Supabase. Wave 8 makes (user, endpoint)
    // unique, so enabling push again refreshes the existing row.
    if (hasSupabase && supabase) {
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          { user_id: userId, subscription: sub.toJSON() },
          { onConflict: "user_id,endpoint" }
        );
      if (error) return { ok: false, reason: "subscription-save-failed" };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

// Remove the local push subscription, if any. Best-effort and never throws.
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) {
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
  } catch {
    // Ignore — unsubscription is best-effort.
  }
}
