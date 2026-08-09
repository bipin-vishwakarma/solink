# Solink architecture

## System overview

Solink is a Next.js App Router client application with two interchangeable
message transports:

```text
Browser UI
  └─ ChatShell
      ├─ LocalTransport ── BroadcastChannel / in-tab Echo peer
      └─ SupabaseTransport
          ├─ Supabase Auth and profiles
          ├─ Postgres + Row Level Security
          ├─ Realtime + polling fallback
          └─ private encrypted attachment storage
```

`app/page.tsx` selects Cloud mode when both public Supabase variables exist;
otherwise it renders Demo mode. Both modes implement the `ChatTransport`
contract from `lib/types.ts`, keeping the primary UI transport-independent.

## Runtime components

| Area | Primary files | Responsibility |
| --- | --- | --- |
| Entry and metadata | `app/` | Routing, PWA metadata, settings, profile |
| Authentication | `components/CloudApp.tsx` | Google OAuth, profile creation, public-key publication |
| Main chat UI | `components/ChatShell.tsx` | Conversation state, messaging UX, stealth and panic modes |
| Demo transport | `lib/localTransport.ts` | BroadcastChannel pairing and Echo simulation |
| Cloud transport | `lib/supabaseTransport.ts` | DM history, realtime, polling, reactions, reads, files |
| Group transport | `lib/groupTransport.ts` | Pairwise fan-out encryption for group messages |
| Cryptography | `lib/crypto.ts` | ECDH, AES-GCM, IndexedDB keys, encrypted key backup |
| Data schema | `supabase/*.sql` | Tables, functions, storage, publications, RLS |
| Push delivery | `lib/push.ts`, `public/sw.js`, `supabase/functions/send-push` | Subscription and generic background notification delivery |

## Direct-message flow

1. Google OAuth establishes a Supabase user session.
2. The browser loads or generates the device ECDH P-256 key pair.
3. The public key is published in the user's profile.
4. `get_or_create_dm` resolves the two-member conversation.
5. Each browser derives an AES-GCM key from its private key and the peer's
   published public key.
6. The sender encrypts the message envelope locally and inserts only ciphertext
   and IV into Postgres.
7. The recipient receives the row through Realtime. A three-second poll is a
   delivery fallback.
8. The recipient decrypts locally and renders plaintext only in browser memory.

Replies and attachment metadata are encoded inside the encrypted message
envelope. The database does not need plaintext-aware columns.

## Attachments

Attachment bytes are AES-GCM encrypted before upload. Cloud mode stores the
encrypted bytes in the private `attachments` bucket under
`<conversation-id>/<random-id>`. The encrypted message envelope carries the
storage path, original name, MIME type, and size. The recipient downloads and
decrypts the object in the browser.

## Group messages

Group messages use pairwise fan-out rather than one shared group key. The sender
derives a key with every member and stores a recipient-indexed map of encrypted
payloads. Each member reads only their entry. This is simple and suitable for
small groups, but encryption work and row size grow linearly with membership.

## Push notifications

The database trigger identifies the other DM member and calls the `send-push`
Edge Function. The function URL and webhook secret come from Supabase Vault.
The Edge Function authenticates the secret, reads subscriptions with its service
role, and sends content-free Web Push payloads. Message plaintext and sender
identity are never passed to the function.

## State and persistence

- IndexedDB: device key pair
- localStorage: onboarding, theme, contacts, local blocks, notification choices
- Supabase Auth: user session
- Postgres: profiles, membership, ciphertext, reads, reactions, subscriptions
- Supabase Storage: encrypted attachments and public profile avatars

## Architectural constraints

- One profile currently publishes one active public key, so automatic
  multi-device key management is incomplete.
- Static ECDH keys provide no forward secrecy.
- Local blocking is not yet a server-enforced deny rule.
- `ChatShell.tsx` owns many concerns and should be decomposed behind tests.
- Raw SQL waves require disciplined ordering and staging validation.
