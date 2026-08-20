# Solink engineering context

This document is the durable map for feature work. It records the boundaries
that must remain stable while the product evolves.

## Product and stack

Solink is a client-first encrypted chat PWA. The current stack is compatible
with free plans and open-source tooling:

| Layer | Technology | Cost posture |
| --- | --- | --- |
| Web application | Next.js 16, React 19, TypeScript | Open source |
| Styling | Tailwind CSS 3 | Open source |
| Cryptography | Browser Web Crypto API | Browser-native |
| Demo transport | Browser `BroadcastChannel` | Browser-native |
| Cloud backend | Supabase Auth, Postgres, Realtime, Storage, Edge Functions | Free-tier compatible |
| Hosting | Vercel | Free-tier compatible |
| Tests and quality | Vitest, ESLint, TypeScript, GitHub Actions | Open source/free for this public repo |
| Source and planning | Git and GitHub Issues/PRs | Free for this public repo |

Free plans have quotas and can change. Before a public launch, check current
Supabase, Vercel, and GitHub limits and add usage alerts. No feature should
silently introduce a paid API, hosted model, proprietary SDK, or metered
service; document the cost and obtain approval first.

## Runtime graph

```text
app/page.tsx
  |
  +-- no Supabase public env --> DemoApp --> LocalTransport
  |                                      --> BroadcastChannel / Echo peer
  |
  +-- Supabase public env ----> CloudApp --> SupabaseTransport (direct messages)
                                         --> GroupTransport (groups)

Both modes --> ChatShell --> ChatTransport --> browser encryption
                                            --> ciphertext transport/storage
                                            --> recipient browser decryption
```

`ChatShell` owns most conversation UI state. The transport boundary in
`lib/types.ts` is the compatibility seam: features should use that contract
instead of teaching the UI about Supabase or `BroadcastChannel` details.

## Direct-message data path

### Send

1. `ChatShell` collects plaintext and optional reply or attachment metadata.
2. `encodeMessage` creates a backwards-compatible plaintext envelope in browser
   memory.
3. The selected transport derives an AES-GCM key using the local ECDH P-256
   private key and the peer's public key.
4. `encryptMessage` creates a fresh IV and ciphertext in the browser.
5. Demo mode posts the encrypted payload through `BroadcastChannel`; Cloud mode
   inserts ciphertext and IV into the `messages` table.
6. The UI marks the optimistic message as sent only after transport success.

### Receive

1. Demo mode receives an encrypted channel event. Cloud mode receives a
   Supabase Realtime insert, with a three-second polling fallback.
2. The transport deduplicates rows/events and decrypts locally.
3. `decodeMessage` reads the versioned envelope or treats legacy content as
   plain text.
4. `ChatShell` renders the in-memory plaintext. Plaintext is not persisted by a
   transport.

The Cloud send path republishes the sender's current public key and refreshes
the recipient's key immediately before encryption. The receive path retries
once with a refreshed peer key to recover from key drift. Preserve this behavior
until a real multi-device key protocol replaces it.

## Other message paths

- Attachments are encrypted locally before storage. Their encrypted envelope
  carries metadata and a storage reference.
- Group messages use pairwise ECDH fan-out: one encrypted entry per recipient.
- Realtime is the fast Cloud delivery path; polling is the reliability fallback.
- Push payloads are content-free and optional. Push failure must never roll back
  a message insert.
- Read receipts, reactions, typing, presence, and deletion are secondary paths;
  they must not be coupled to successful text delivery.

## Persistence and trust boundaries

| Location | Allowed data |
| --- | --- |
| Browser memory | Decrypted messages and derived keys while in use |
| IndexedDB | Device ECDH key pair |
| localStorage | UI preferences, onboarding, contacts, local blocks |
| Supabase Auth | Session and identity |
| Postgres | Profiles, memberships, ciphertext, IVs, metadata, receipts, reactions |
| Storage | Encrypted attachments; public profile avatars |
| Push service | Generic content-free notification |

Static ECDH does not provide forward secrecy, one profile currently publishes
one active public key, and the implementation has not received an independent
cryptographic audit. Product copy must not claim otherwise.

## Protected verification matrix

Run `npm run check` for every change. Messaging or identity changes also require
the applicable manual checks below using non-production accounts and data.

| Flow | Demo | Cloud |
| --- | --- | --- |
| Send and receive text between two peers | Two tabs in one room | Two distinct users |
| Refresh/reconnect without duplicates | Required | Required |
| Failed send is visible and retryable | Required | Required |
| Older history remains readable | N/A | Required |
| Reply envelope and legacy plain message | Required | Required |
| Attachment encrypt, upload/relay, download, decrypt | Required | Required |
| Read receipt, reaction, typing, presence, unsend | When supported | Required |
| Recipient public-key change | N/A | Required for identity/crypto changes |
| Group send and receive | N/A | Required for group changes |

Never perform these checks with real private conversations. Production database
or environment changes follow `docs/DEPLOYMENT.md` and require explicit approval.

## Dependency policy

- The lockfile is authoritative; use `npm ci` for clean installs and CI.
- Patch and minor updates still require the full check suite.
- Framework, cryptography, Supabase, build-system, and major-version updates get
  focused branches and pull requests.
- Prefer browser and platform capabilities over new packages.
- Keep runtime dependencies small and compatible with the free-stack goal.
- Run `npm audit` and inspect Dependabot PR failures before merging.

## Web release versioning

Keep the semantic version in `package.json`, `package-lock.json`, and
`lib/appVersion.ts` aligned for every user-visible release. The root layout
checks the uncached `/version.json` endpoint on load, reconnect, tab visibility,
and every five minutes. A mismatch offers an Update button to already-open web
and installed-PWA clients. Update checks are optional and must never interrupt
message sending or receiving.

## Git and GitHub workflow

1. Update local `main`, then create `codex/<short-purpose>` or another focused
   feature/fix branch.
2. Add or update an issue with acceptance criteria for user-visible work.
3. Make small Conventional Commits such as `feat:`, `fix:`, `test:`, `docs:`,
   `refactor:`, `chore:`, or `ci:`.
4. Open a pull request using the repository template. Include privacy impact,
   checks performed, manual flows, migration/deployment needs, and rollback.
5. Merge only after CI passes and the diff is reviewed. Deploy separately using
   the runbook.

The untracked production incident report at the repository root predates this
workspace baseline. Do not add, edit, remove, or commit it unless the user asks.
