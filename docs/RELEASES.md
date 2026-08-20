# Solink releases

Solink uses semantic versions for user-visible web releases. Keep
`package.json`, `package-lock.json`, and `lib/appVersion.ts` aligned in every
release pull request. Already-open web and installed-PWA sessions poll the
uncached `/version.json` endpoint and offer an Update button when its version
differs from their bundled version.

## 0.2.1 - 2026-08-21

- Keep mobile chat options above message content by rendering the action sheet
  outside the animated chat stacking context.
- Make the mobile action sheet scrollable, safe-area aware, dismissible, and
  keyboard accessible while preserving the desktop dropdown.

## 0.2.0 - 2026-08-20

- Sync and enforce account blocks across linked devices.
- Stop blocked direct-message inserts and optional secondary interactions.
- Replace misleading Cloud-mode local chat removal with synced Archive.
- Notify already-open web/PWA sessions when a new Solink release is available.

### Reliability and cross-device update - 2026-08-21

- Queue DM text and encrypted reply envelopes as ciphertext-only IndexedDB records.
- Retry with stable message UUIDs through an idempotent, RLS-protected send RPC.
- Add privacy-filtered account presence with coarse last-seen.
- Sync typed theme, stealth, notification, read-receipt, and presence settings.
- Make small-group creation atomic and add versioned envelopes, member-key refresh,
  and paginated history while preserving legacy rows.
- Expand the automated core suite to 38 tests.
