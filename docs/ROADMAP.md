# Solink roadmap

The roadmap is ordered by user safety and product reliability, not novelty.
Dates are intentionally omitted until an issue has an owner, scope, and tested
acceptance criteria.

## Product principles

1. Never claim a security property the implementation does not provide.
2. Preserve message delivery before adding secondary features.
3. Keep plaintext and secrets on the correct side of every trust boundary.
4. Make failure visible and recoverable.
5. Ship accessible mobile-first interactions.
6. Require measurable verification before production rollout.

## Current foundation

- Next.js/React PWA deployed on Vercel
- Google OAuth and Supabase profiles
- encrypted DMs and attachments
- history, reads, reactions, presence, typing, and unsend
- pairwise encrypted small-group chats
- encrypted passphrase-wrapped device-key backup
- foreground and background notifications
- Demo mode, stealth display, and panic IDE
- five-device approval and encrypted history synchronization
- account-synced unread, archive, pin, mute, blocks, and preferences
- ciphertext-only offline DM outbox with idempotent retry
- privacy-filtered global presence and coarse last-seen
- atomic small-group creation and paginated group history

## P0 — Security and recoverability

- [x] Stage and apply Wave 8 authorization hardening.
- [x] Deploy and verify authenticated push delivery.
- [ ] Add automated RLS policy tests.
- [x] Replace automatic public-key overwrite with an explicit device enrollment
      and recovery flow.
- [ ] Add peer key-change warnings and human-verifiable fingerprints.
- [x] Enforce blocking at the database authorization layer.
- [x] Restrict attachment object access to conversation members.
- [x] Add Referrer Policy, MIME sniffing protection, framing protection, and Permissions Policy.
- [ ] Add and stage a complete Content Security Policy.
- [x] Enable GitHub private vulnerability reporting and dependency alerts.

## P1 — Messaging reliability

- [ ] Choose and add an explicit open-source or source-available license.
- [x] Add automated tests for encryption envelopes and transport deduplication.
- [ ] Add browser end-to-end tests for two-user DM and group flows.
- [ ] Cancel stale transport startup work when switching conversations.
- [x] Add offline/outbox behavior with deterministic retries for DM text and replies.
- [ ] Extend the offline lifecycle to encrypted attachments and groups.
- [x] Clean up orphaned encrypted attachments after failed message inserts.
- [ ] Add observable delivery diagnostics without logging plaintext.
- [ ] Define database backup and restore drills.

## P2 — Accessibility and user experience

- [ ] Restore user zoom and complete a WCAG 2.2 AA audit.
- [ ] Add dialog semantics, focus traps, Escape handling, and focus restoration.
- [ ] Give every icon control an explicit accessible name.
- [ ] Verify keyboard-only and screen-reader messaging flows.
- [ ] Add reduced-motion behavior and contrast tests.
- [ ] Improve onboarding around keys, backups, metadata, and device changes.
- [ ] Add clear loading, empty, error, and recovery states.

## P3 — Architecture and scale

- [ ] Split `ChatShell` into conversation, transport, notification, attachment,
      and presentation modules behind tests.
- [x] Replace raw manual SQL execution with versioned Supabase migrations.
- [ ] Design a real multi-device key protocol.
- [ ] Evaluate a ratcheting protocol for forward secrecy and post-compromise
      security.
- [ ] Define group membership changes, key rotation, roles, and removal.
- [ ] Add performance budgets and production telemetry that excludes content.

## Definition of done

A roadmap item is complete only when:

- acceptance criteria and abuse cases are documented;
- automated checks cover the important behavior;
- accessibility and privacy impacts are reviewed;
- staging verification passes;
- migrations, deployment, and rollback are documented;
- user-facing documentation matches the shipped behavior.
