# Solink security model

This document defines what Solink protects, what it trusts, and what it does not
yet guarantee. Product copy and engineering decisions should remain consistent
with these boundaries.

## Protected assets

- message and attachment plaintext;
- device private-key material;
- encrypted key-backup blobs and their passphrases;
- authenticated Supabase sessions;
- push subscription endpoints and webhook secrets.

## Trust boundaries

The browser application is inside the trusted computing base. Solink assumes the
served JavaScript, browser, Web Crypto implementation, operating system, and
device are not compromised. Supabase Auth is trusted to identify accounts, RLS
is trusted to enforce authorization, and Vercel is trusted to deliver the
intended application bundle.

The database and storage layer are not trusted with message or attachment
plaintext. They are trusted for availability, metadata storage, and public-key
distribution.

## Content encryption

Each browser stores an ECDH P-256 key pair in IndexedDB. For a direct message,
the local private key and peer public key derive a 256-bit AES-GCM key. Every
message uses a random 96-bit IV. Attachments use the same derived key with a
fresh IV prepended to the encrypted bytes.

Private keys are extractable because cross-device backup exports the private JWK,
derives an AES-GCM wrapping key with PBKDF2-SHA-256 and 210,000 iterations, and
uploads only the wrapped backup. The passphrase is never intentionally sent to
the server.

## What the server can observe

Even when content encryption works correctly, infrastructure can observe:

- account identifiers and usernames;
- public keys and avatar URLs;
- conversation and group membership;
- sender identifiers and message timestamps;
- ciphertext, IVs, approximate plaintext length, and attachment sizes;
- online presence, typing, reads, reactions, and push subscriptions;
- IP addresses and normal HTTP/Realtime connection metadata.

Solink is content-private, not metadata-private.

## Current limitations

### No forward secrecy

Long-lived static ECDH keys derive the conversation key. Compromise of a private
key plus retained ciphertext can expose past messages encrypted for that key.
There is no Double Ratchet or automatic key rotation protocol.

### No verified peer identity

Public keys come from the profile table. The UI does not currently provide a
peer safety-number comparison or signed-key history. A malicious or compromised
key directory could substitute a peer public key for future messages.

### Incomplete multi-device model

One profile publishes one active public key. Signing in on another browser can
replace that key, causing history and simultaneous-device inconsistencies unless
the original key is restored from backup.

### Endpoint compromise

Encryption cannot protect plaintext displayed on an unlocked device, copied to
the clipboard, captured in screenshots, read by malicious extensions, or
accessed through injected JavaScript.

### Local blocking

The current block list suppresses UI and notifications locally. It is not a
server-side authorization boundary and must not be described as preventing
message insertion.

## Server-side authorization invariants

- A message sender must be a member of its conversation.
- Read receipts and reactions must reference a message visible to the caller.
- A group UUID alone must not permit self-membership.
- Storage uploads must be scoped to the authenticated owner or conversation.
- The push Edge Function must reject requests without the Vault-matched webhook
  secret.
- Service-role credentials and webhook secrets must never enter client bundles
  or Git history.

## Security review checklist

Changes affecting auth, profiles, keys, envelopes, transports, SQL, storage,
Realtime, service workers, or Edge Functions require:

1. a documented threat and abuse case;
2. RLS tests for anonymous, non-member, member, and owner roles;
3. confirmation that plaintext and secrets do not cross the intended boundary;
4. migration and rollback instructions;
5. dependency, lint, type, and production-build checks;
6. staging verification before production rollout.
