# Multi-device architecture

Status: accepted direction; implementation is phased and tracked in GitHub
issues #12 through #15.

## Product decision

- Google SSO links up to five active installations to one account. Revoking a
  device frees a slot.
- Solink continues to provide end-to-end content encryption. SSO proves control
  of the account; it does not give the server permission to decrypt history.
- A fresh installation must not silently replace encryption material already
  used by the account.
- Complete old-history recovery requires possession of compatible key material.
  The current bridge is the user's passphrase-wrapped key backup. Future
  messages will use versioned per-device envelopes so every active installation
  receives its own encrypted copy.

This is the strongest design compatible with the requested SSO-first experience.
Before Phase 4, sign-in links a fresh installation in a limited recovery state;
it cannot safely message under a different key. After Phase 4, SSO is enough to
register the installation for future messages, but it still cannot
cryptographically recreate a lost private key for legacy ciphertext.

## Delivery phases

### Approved-device compatibility bridge

A new installation signs in with Google, then requests approval from an already
active Solink installation. Both show the same six-digit comparison code. After
explicit approval, the working installation wraps the established account key
for the candidate key using one-time ECDH, HKDF-SHA-256, and AES-GCM. Supabase
relays only the encrypted envelope. The candidate decrypts in memory, verifies
the restored public key against `profiles.public_key`, atomically claims one of
the five device slots, and only then persists the restored key.

Requests expire after ten minutes, are bound to the requesting Auth session,
cannot approve themselves, and are single-use. The passphrase-wrapped backup
remains a fallback when no working installation is available. This bridge keeps
legacy history readable but copies the legacy account private key; it is not a
substitute for Phase 4 per-device envelopes or cryptographic revocation.

### Phase 1: stop destructive key replacement (#12)

At login, compare the installation's public key with `profiles.public_key`.

```text
no profile -> normal username/profile creation
matching key -> enter the app
different key + backup -> recovery-required screen
different key + no backup -> history-unavailable safety screen
```

The mismatch path never updates the profile automatically. A successful backup
restore imports the established key locally, verifies it against the profile,
then enters the app. This phase preserves the existing message format and does
not require a production migration.

This first patch is client-enforced. The currently deployed profile RLS still
allows an owner (including an older Solink bundle) to update `public_key`; fully
immutable/versioned keys arrive with the device directory. Until then, release
and cache control must prevent an old client from reintroducing replacement.

### Phase 2: account data synchronization (#13)

Cloud-mode preferences move from browser-only storage to owner-only Supabase
records with timestamps or revisions for deterministic conflict resolution.
Conversation membership becomes the source for the chat/contact list. Blocks
become database-enforced. Demo mode retains local-only behavior.

Account-scoped examples: theme, stealth defaults, auto-stealth, pins, archive,
mutes, and blocks. Device-scoped examples: notification permission, push
subscription, device name, and local app lock.

### Phase 3: device registry and revocation (#14)

Add owner-only installation records with an atomic five-active-device cap: random ID, name,
coarse platform label, created time, last-active time, public key, key version,
and revoked time. Settings lists devices, marks the current one, supports rename
and removal, and can sign out all other sessions where the auth platform allows.

Revocation removes future application access and key delivery but cannot erase
plaintext or ciphertext already downloaded by a compromised device.

The first registry release is inventory and capacity enforcement. A remote
removal does not yet invalidate that browser's Supabase refresh token because
current Auth tokens identify the account, not a particular installation. Hard
revocation requires device-bound authorization on every protected data path.

### Phase 4: per-device encryption (#15)

Add a versioned ciphertext envelope containing one encrypted content key or
payload per active recipient device and per active sender device. Preserve a
legacy decrypt path for existing rows. Device add/remove and group membership
changes update only future envelopes. This phase requires migrations, staged
rollout, rollback, and complete multi-device browser testing.

## Data classification

| Scope | Data |
| --- | --- |
| Account | profile, conversation membership, groups, blocks, pins, archive/mute preferences |
| Device | installation ID/name, platform, public key, key version, push subscription, last active |
| Local only | private key, recovery passphrase, biometric/PIN material, decrypted search index |
| Server ciphertext | messages, attachments, wrapped backups, future per-device key envelopes |

## Non-negotiable compatibility rules

1. Existing direct and group ciphertext stays readable wherever the legacy key
   exists.
2. New envelope versions are additive and explicitly tagged.
3. Realtime failure continues to fall back to polling.
4. Optional sync, push, device-presence, and settings failures never block a
   valid message insert or receive.
5. No migration, deployment, or key rotation is combined with unrelated feature
   or dependency work.
