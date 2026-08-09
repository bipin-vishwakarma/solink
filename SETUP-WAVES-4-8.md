# 🔒 Solink — Waves 4–8 Setup

Follow these once, in order. Each wave is independent — you can stop after any of them.
Everything here stays **free**, and Solink stays **end-to-end encrypted** the whole way.

Your Supabase project ref: `zfkxtakrcsqncdxslsvx`

Total time: ~15 minutes.

---

## Wave 4 — Encrypted attachments

Store encrypted files (images/docs) in a private bucket. The bytes are already
E2E-encrypted before upload, so the server never sees anything readable.

1. Open **SQL Editor** → **New query**.
2. Paste all of `supabase/wave4-storage.sql` → **Run**.

That's it. This creates a **private** bucket called `attachments` and the access
policies. (Prefer clicking? **Dashboard → Storage → New bucket → name `attachments`,
Public = OFF**. The SQL is still the easiest way to get the policies right.)

Nothing else to configure.

---

## Wave 5 — Read receipts (+ presence)

1. Open **SQL Editor** → **New query**.
2. Paste all of `supabase/wave5-reads-presence.sql` → **Run**.

This creates the `message_reads` table, its security rules, and adds it to Realtime.

**Presence is automatic** — online / last-seen uses Supabase Realtime Presence on the
existing per-conversation channel. There is **no table and no setup** for presence.

---

## Wave 6 — Web Push notifications

Push needs a pair of VAPID keys, one env var in your app, one table, and a deployed
Edge Function.

**a) Generate VAPID keys**
```bash
npx web-push generate-vapid-keys
```
Copy the **Public Key** and **Private Key** it prints.

**b) Add the public key to your app**
Add to `.env.local`:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your-vapid-public-key>
```
Then add the same var in **Vercel → Project → Settings → Environment Variables**.
(Restart `npm run dev` after editing `.env.local`.)

**c) Create the subscriptions table**
Open **SQL Editor** → **New query** → paste all of `supabase/wave6-webpush.sql` → **Run**.

**d) Create a dedicated webhook secret and set the function secrets**

Generate a random 32-byte secret (for example, `openssl rand -hex 32`). Keep
the value out of Git. Use the same value for `PUSH_WEBHOOK_SECRET` here and
`solink_push_webhook_secret` in Vault below.

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=<your-vapid-public-key> \
  VAPID_PRIVATE_KEY=<your-vapid-private-key> \
  VAPID_SUBJECT=mailto:you@example.com \
  PUSH_WEBHOOK_SECRET=<random-32-byte-secret>
```

**e) Store the function URL + matching secret in Supabase Vault**

Run this in the SQL Editor. Replace the placeholders; never commit the secret.

```sql
select vault.create_secret(
  'https://<your-project-ref>.supabase.co/functions/v1/send-push',
  'solink_send_push_url'
);
select vault.create_secret(
  '<same-random-32-byte-secret>',
  'solink_push_webhook_secret'
);
```

**f) Deploy the Edge Function**

JWT verification is disabled at the gateway because the database trigger is
not a user session. The function itself rejects every request without the
Vault-matched `X-Solink-Push-Secret` header.

```bash
supabase functions deploy send-push --no-verify-jwt
```

(If you haven't linked the CLI yet: `supabase link --project-ref zfkxtakrcsqncdxslsvx`.)

**g) Install the database trigger**

Run `supabase/wave6-trigger.sql` in the SQL Editor. Push configuration is
optional: missing Vault secrets cause the trigger to skip push without ever
blocking message delivery.

---

## Wave 7 — Group chats

Run `supabase/wave7-groups.sql` in the SQL Editor.

---

## Wave 8 — Schema completion + authorization hardening

Run `supabase/wave8-security-hardening.sql` after Waves 4–7. It:

- adds the avatar schema and storage policies used by the profile UI;
- adds the reactions table and Realtime publication;
- prevents forged read receipts and group self-joins;
- de-duplicates Web Push subscriptions.

---

## Notes / gotchas
- **Still end-to-end:** attachments are encrypted before upload and push payloads are
  generic ("New message") — the server never sees file contents or message text. 🔒
- **Stealth mode:** when the app sends `disguised: true`, the notification shows a bare
  "New message" with no body, so nothing leaks on the lock screen.
- **Env vars load on server start** — always restart `npm run dev` after editing `.env.local`.
