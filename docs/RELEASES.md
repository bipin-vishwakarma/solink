# Solink releases

Solink uses semantic versions for user-visible web releases. Keep
`package.json`, `package-lock.json`, and `lib/appVersion.ts` aligned in every
release pull request. Already-open web and installed-PWA sessions poll the
uncached `/version.json` endpoint and offer an Update button when its version
differs from their bundled version.

## 0.2.0 - 2026-08-20

- Sync and enforce account blocks across linked devices.
- Stop blocked direct-message inserts and optional secondary interactions.
- Replace misleading Cloud-mode local chat removal with synced Archive.
- Notify already-open web/PWA sessions when a new Solink release is available.
