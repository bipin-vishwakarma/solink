# Deployment and rollback runbook

Production changes are intentionally separate from code review. Do not deploy
from an unreviewed working tree.

## Environments

| Environment | Purpose |
| --- | --- |
| Local | Demo mode or developer Supabase project |
| Vercel Preview | Pull-request validation |
| Staging Supabase | SQL, RLS, Realtime, storage, and Edge Function validation |
| Production | `https://solink-omega.vercel.app` and the production Supabase project |

Production and staging must not share OAuth credentials, service-role keys,
webhook secrets, push subscriptions, or user data.

## Required Vercel variables

Configure these independently for Development, Preview, and Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

All three are browser-visible by design. Never expose the Supabase service-role
key, VAPID private key, or push webhook secret through a `NEXT_PUBLIC_` name.

## Fresh Supabase setup order

Apply each file once, in order, to a new project:

1. `supabase/schema.sql`
2. `supabase/wave4-storage.sql`
3. `supabase/wave5-reads-presence.sql`
4. `supabase/wave6-webpush.sql`
5. `supabase/wave7-groups.sql`
6. `supabase/wave8-security-hardening.sql`
7. `supabase/migrations/20260820213000_account_devices.sql`

Then configure Google OAuth and allowed redirect URLs as described in
`SETUP-CLOUD.md`.

For an existing linked project, committed files under `supabase/migrations/`
are the production change record. Preview and apply only pending migrations:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
```

Never use `supabase db reset --linked` on production.

The account-device migration must be applied before enabling the linked-devices
UI in production. Validate its RLS and `register_account_device` concurrency in
staging; do not treat inventory removal as Auth-session revocation.

## Push delivery setup

1. Generate VAPID keys and a separate random 32-byte webhook secret.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and
   `PUSH_WEBHOOK_SECRET` as Supabase Edge Function secrets.
3. Store the function URL as `solink_send_push_url` and the same webhook secret
   as `solink_push_webhook_secret` in Supabase Vault.
4. Deploy:

   ```bash
   supabase functions deploy send-push --no-verify-jwt
   ```

5. Apply the pending authenticated push-trigger migration with
   `supabase db push --linked --dry-run`, followed by
   `supabase db push --linked`.

Gateway JWT verification is deliberately disabled for this server-to-server
trigger. The Edge Function itself must return HTTP 401 when the
`X-Solink-Push-Secret` header is absent or incorrect.

## Release workflow

1. Open a focused pull request.
2. Wait for CI and review the Vercel Preview.
3. Run `npm audit` and test Cloud mode against staging.
4. Apply backward-compatible SQL migrations to staging.
5. Deploy and test Edge Functions in staging.
6. Apply required backward-compatible production migrations.
7. Deploy and verify the production Edge Function when its contract changes.
8. Merge only after the backend verification checklist passes.
9. Let Vercel deploy the reviewed `main` commit.
10. Record commit SHA, migration files, operator, and verification result.

## Production verification

- Google OAuth completes and returns to the production origin.
- Existing users load their profiles without key replacement surprises.
- Existing users register in `account_devices`; five active devices are allowed
  and a concurrent sixth registration is rejected with `DEVICE_LIMIT_REACHED`.
- Two distinct users can send, receive, reconnect, and load history.
- Ciphertext—not plaintext—is stored in message rows.
- Reads, reactions, unsend, and typing behave correctly.
- Encrypted image/file upload and download work.
- Group creation and messaging work for members; non-members are denied.
- Push works with the app closed and rejects an invalid webhook secret.
- `/settings`, `/profile`, manifest, service worker, and Open Graph image load.
- Vercel and Supabase logs show no new recurring errors.

## Rollback

### Vercel

Promote the last known-good production deployment or revert the merge commit.
Confirm that environment variables still match the restored application.

### Edge Function

Deploy the function from the last known-good commit. If push delivery itself is
causing harm, disable the message trigger through a reviewed emergency
migration; message insertion is designed to continue without push.

### Database

Do not improvise destructive down migrations. Most Solink migrations are
additive: prefer disabling the new code path, correcting policies/functions
forward, and preserving user data. Back up the affected schema and document any
exception before changing production rows or dropping objects.

## Secret rotation

Rotate a suspected push webhook secret in this order:

1. create a new Vault value;
2. update the Edge Function secret;
3. redeploy the function;
4. verify push;
5. remove obsolete Vault values.

Rotate OAuth, Supabase, or VAPID credentials using their provider runbooks and
expect affected sessions or subscriptions to require renewal.
