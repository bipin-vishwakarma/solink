# 🔗 Solink

[![CI](https://github.com/bipin-vishwakarma/solink/actions/workflows/ci.yml/badge.svg)](https://github.com/bipin-vishwakarma/solink/actions/workflows/ci.yml)

**End-to-end encrypted chat that disguises your messages as code.** Built with Next.js +
the native Web Crypto API. Hit a panic key and the whole screen becomes a fake VS Code.

## Try it

Production: **https://solink-omega.vercel.app**

Demo mode works without an account. Cloud features use Google sign-in.

## Features

- 🔒 **Real end-to-end encryption** — ECDH P-256 key exchange + AES-GCM. Only ciphertext
  ever crosses the wire (there's a live `wire ▸` strip that shows it).
- 💬 **Real-time 1-on-1 chat** — open the app in two browser tabs and they pair peer-to-peer
  over a `BroadcastChannel`. Solo? A demo "Echo" peer replies so you can try everything.
- 🥷 **Stealth mode** — every message renders as a syntax-highlighted line of code with line
  numbers. **Tap any line to reveal the real English.**
- 🚨 **Panic key** — `Ctrl+Shift+.` instantly flips into a full fake VS Code (file explorer,
  tabs, editor, terminal, status bar). `Esc` to exit.
- ☁️ **Encrypted Cloud chat** — Google login, usernames, synced encrypted history, and
  client-decrypted inbox previews across up to five linked devices.
- 📴 **Reliable offline sending** — text and encrypted reply envelopes queue as ciphertext
  in IndexedDB and retry with stable message IDs, preventing duplicate inserts.
- 👥 **Encrypted small groups** — atomic creation, pairwise recipient encryption,
  backward-compatible envelopes, member-key refresh, and paginated history.
- 🔕 **Synced chat controls** — unread state, pin, mute, archive, account blocks, theme,
  stealth defaults, read receipts, notifications, and presence privacy follow the account.
- 🟢 **Privacy-aware presence** — global online/coarse last-seen uses Contacts by default,
  supports Nobody or Everyone, and returns unknown when visibility is denied.
- 📱 **PWA and updates** — responsive mobile UI, background content-free push, linked-device
  management, and an in-app Update button for future releases.

### Shortcuts
| Key | Action |
| --- | --- |
| `Ctrl+Shift+.` | Toggle full IDE takeover (panic) |
| `Ctrl+Shift+,` | Toggle stealth (code) view |
| `Esc` | Exit the IDE takeover |
| tap a code line | reveal / hide the English text |

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. To see a real two-person encrypted chat, open the same URL in a
**second tab** (optionally add `?room=myroom` to both to share a room). Otherwise just start
typing and the demo peer replies.

## How the encryption works

1. Each device generates an **ECDH P-256** key pair on first load. The private key stays in
   IndexedDB during normal use. It is extractable only so the user can create a
   passphrase-encrypted cross-device backup.
2. Two peers exchange **public** keys and each derives the **same AES-GCM key** locally.
3. Messages are encrypted with AES-GCM + a random IV. The transport only relays
   `{ ciphertext, iv }`. See `lib/crypto.ts`.

## Project layout

```
app/
  page.tsx             picks Demo vs Cloud mode
components/
  DemoApp.tsx          name gate + local transport
  CloudApp.tsx         Google auth + username setup + cloud transport
  ChatShell.tsx        shared chat UI (sidebar, messages, stealth, IDE, hotkeys)
  Sidebar.tsx          contacts + connect-by-username
  MessageBubble.tsx    normal chat bubble
  CodeSnippet.tsx      message-as-code + tap-to-reveal
  BossModeIDE.tsx      full fake-VS-Code overlay
  Avatar.tsx           generated avatars
lib/
  crypto.ts            ECDH + AES-GCM + IndexedDB key storage
  disguise.ts          message id -> plausible code line (seeded, deterministic)
  types.ts             ChatTransport / TransportEvents interfaces
  localTransport.ts    Demo: BroadcastChannel pairing + Echo fallback
  supabaseClient.ts    Supabase client + hasSupabase switch
  supabaseTransport.ts Cloud: encrypted DM history, realtime, polling, retry
  encryptedOutbox.ts   ciphertext-only offline queue and background drain
  groupTransport.ts    pairwise encrypted group messaging and pagination
  accountPresence.ts   privacy-filtered global presence heartbeat/query
  accountSettings.ts   typed account-level preference synchronization
supabase/schema.sql    tables + RLS + get_or_create_dm RPC
supabase/migrations/   ordered production schema and RLS changes
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY-MODEL.md)
- [Deployment and rollback](docs/DEPLOYMENT.md)
- [Supabase Waves 4–8 setup](SETUP-WAVES-4-8.md)
- [Product and engineering roadmap](docs/ROADMAP.md)
- [Release history](docs/RELEASES.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

## Cloud mode — Google login + saved history (built in ✅)

Set two env vars and Solink automatically upgrades from Demo mode to **Cloud mode**:
Google sign-in, global usernames, and chat history saved in Supabase — still end-to-end
encrypted (the DB stores only ciphertext).

- Demo mode ↔ Cloud mode is decided by `hasSupabase` in `lib/supabaseClient.ts`.
- Cloud transport (`lib/supabaseTransport.ts`) implements the same `ChatTransport` interface
  as the demo one, so the UI (`components/ChatShell.tsx`) is identical in both modes.

👉 **Full step-by-step setup: [`SETUP-CLOUD.md`](SETUP-CLOUD.md)** (create the Supabase
project, run `supabase/schema.sql`, enable Google auth, add your keys to `.env.local`).

## Security note

The disguise is presentation-only. Solink encrypts content in the browser before transport,
but the cryptographic design has not received an independent audit. It uses static ECDH and
does not provide Signal-style forward secrecy, a ratchet, or automatic peer safety-number
verification. See the [security model](docs/SECURITY-MODEL.md) before relying on it for
sensitive communication.
