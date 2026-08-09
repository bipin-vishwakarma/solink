// ============================================================================
// Solink — Edge Function: send-push
// ============================================================================
// Sends a Web Push notification to every device a user has registered.
//
// Request (POST):  { recipientId: string, disguised: boolean }
//
// Privacy / stealth:
//   This function NEVER sees plaintext. All message content is end-to-end
//   encrypted on the client, so the push payload can only ever be generic —
//   it cannot include the sender name or message text.
//     - disguised === true  -> title "New message", empty body (maximally plain)
//     - disguised === false -> title "Solink",       body  "New message"
//
// Environment (set via `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY   — VAPID public key
//   VAPID_PRIVATE_KEY  — VAPID private key
//   VAPID_SUBJECT      — e.g. mailto:you@example.com
//   PUSH_WEBHOOK_SECRET       — random secret shared only with the DB trigger
//   SUPABASE_URL              — provided automatically by the platform
//   SUPABASE_SERVICE_ROLE_KEY — provided automatically by the platform
// ============================================================================

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// --- VAPID setup -----------------------------------------------------------
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(providedHash);
  const b = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

// --- Handler ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (
    !VAPID_PUBLIC_KEY ||
    !VAPID_PRIVATE_KEY ||
    !PUSH_WEBHOOK_SECRET ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return json({ error: "Function secrets are not configured" }, 500);
  }

  const providedSecret = req.headers.get("x-solink-push-secret");
  if (!providedSecret || !(await secretsMatch(providedSecret, PUSH_WEBHOOK_SECRET))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const { recipientId, disguised } = await req.json();

    if (
      typeof recipientId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipientId)
    ) {
      return json({ error: "A valid recipientId is required" }, 400);
    }

    // Service-role client: this function runs server-side and needs to read
    // any user's push subscriptions.
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("user_id", recipientId);

    if (error) {
      return json({ error: error.message }, 500);
    }

    if (!subs || subs.length === 0) {
      return json({ sent: 0, message: "No subscriptions for recipient" });
    }

    // Build the stealth-aware payload. Never contains sender or content.
    const payload = JSON.stringify(
      disguised
        ? { title: "New message", body: "" }
        : { title: "Solink", body: "New message" },
    );

    // Fan out to every registered device. Prune subscriptions the push
    // service reports as gone (404 / 410).
    let sent = 0;
    const staleIds: string[] = [];

    await Promise.all(
      subs.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          sent++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleIds.push(row.id);
          } else {
            console.error("web-push error:", err);
          }
        }
      }),
    );

    // Clean up expired subscriptions.
    if (staleIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", staleIds);
    }

    return json({ sent, pruned: staleIds.length });
  } catch (err) {
    console.error("send-push failed:", err);
    return json({ error: "Internal error" }, 500);
  }
});
