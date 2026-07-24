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
//   SUPABASE_URL              — provided automatically by the platform
//   SUPABASE_SERVICE_ROLE_KEY — provided automatically by the platform
// ============================================================================

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// --- CORS ------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// --- VAPID setup -----------------------------------------------------------
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// --- Handler ---------------------------------------------------------------
Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID keys are not configured" }, 500);
  }

  try {
    const { recipientId, disguised } = await req.json();

    if (!recipientId || typeof recipientId !== "string") {
      return json({ error: "recipientId is required" }, 400);
    }

    // Service-role client: this function runs server-side and needs to read
    // any user's push subscriptions.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
