# Contributing to Solink

Solink handles identity, encrypted content, storage, and notifications. Treat
every change as production-sensitive even when the UI change looks small.

## Development workflow

1. Start from an up-to-date `main`.
2. Create a focused `codex/<purpose>` branch (or the project convention used by
   your client), such as `codex/message-search`.
3. Keep commits small, reviewable, and independently meaningful.
4. Run `npm run check` before opening a pull request.
5. Use the pull-request template and document migrations or environment changes.
6. Update `README.md` and the relevant files in `docs/` whenever behavior,
   deployment order, security claims, roadmap status, or user-visible features change.

Never commit `.env.local`, `.vapid.env`, Supabase service-role keys, OAuth
secrets, private VAPID keys, Vault values, user data, or encryption backups.

## Commit style

Use Conventional Commit subjects:

- `feat:` user-visible capability
- `fix:` bug or security correction
- `docs:` documentation only
- `test:` test coverage
- `refactor:` behavior-preserving restructuring
- `chore:` dependencies and repository maintenance
- `ci:` automation and delivery workflow

Write subjects in the imperative mood, keep unrelated changes in separate
commits, and explain non-obvious security tradeoffs in the commit body.

## Required checks

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm audit
```

For messaging changes, manually test Demo mode and Cloud mode with two distinct
users. Include reconnect, history, failed-send, read receipt, and attachment
behavior when relevant.

## Database and Edge Function changes

- Add a new ordered file under `supabase/migrations/`; never rewrite an applied
  migration or deployed user data casually.
- Prefer additive and idempotent SQL.
- Enable RLS on every client-accessible table.
- Define explicit SELECT, INSERT, UPDATE, and DELETE policies.
- Test policies as anonymous, authenticated non-member, member, and owner.
- Keep service-role credentials out of SQL and client bundles.
- Document the exact migration and rollback order.

SQL and Edge Function changes are not considered production-verified until they
have been exercised against a non-production Supabase project.

## Pull requests

A pull request should explain:

- the user problem and chosen solution;
- security, privacy, and compatibility impact;
- commands and manual flows tested;
- environment variables or migrations required;
- rollback steps.

For backward-compatible frontend dependencies, deploy and verify the migration
before merging the frontend. Follow `docs/DEPLOYMENT.md` and record the exact order.
