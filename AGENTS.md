# Solink engineering guardrails

This repository is a production-sensitive encrypted messaging application. Read
`docs/ENGINEERING-CONTEXT.md` before changing runtime code.

## Protected invariants

1. A message is encrypted in the sender's browser before a transport or storage
   API receives it. Supabase, logs, notifications, and analytics must never
   receive message plaintext.
2. Demo mode and Cloud mode continue to implement the `ChatTransport` contract
   from `lib/types.ts`.
3. Message delivery is more important than optional features. Push,
   notifications, reactions, presence, typing, and previews must fail without
   blocking a message insert or receive path.
4. Existing encrypted envelopes remain readable. Extend the versioned envelope
   additively; do not silently reinterpret old ciphertext payloads.
5. Never expose private keys, passphrases, service-role keys, VAPID private
   keys, Vault values, user data, or plaintext in source, tests, screenshots,
   logs, commits, issues, or pull requests.
6. Database access remains protected by explicit RLS policies. Schema changes
   use a new ordered migration and include rollout and rollback notes.

## Change workflow

- Work on a focused branch; do not commit directly to `main`.
- Keep product changes separate from dependency, migration, and documentation
  changes.
- Keep `README.md` and the relevant `docs/` files aligned with every shipped
  feature, migration order, security boundary, and roadmap status.
- Prefer the smallest behavior-preserving change that solves the issue.
- Do not upgrade major framework versions as part of unrelated feature work.
- Run `npm run check` before committing. For messaging changes, also run
  `npm run test:core` and manually exercise the relevant two-peer flows listed
  in `docs/ENGINEERING-CONTEXT.md`.
- Review `git diff --check`, `git diff`, and `git status --short` before every
  commit. Use Conventional Commit subjects.
- Do not push, merge, deploy, apply a Supabase migration, rotate a secret, or
  modify production configuration without explicit user approval.
