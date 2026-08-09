# 🔗 Solink

**End-to-end encrypted chat that disguises your messages as code.** Built with Next.js +
the native Web Crypto API. Hit a panic key and the whole screen becomes a fake VS Code.

## Features (working now — no accounts needed)

- 🔒 **Real end-to-end encryption** — ECDH P-256 key exchange + AES-GCM. Only ciphertext
  ever crosses the wire (there's a live `wire ▸` strip that shows it).
- 💬 **Real-time 1-on-1 chat** — open the app in two browser tabs and they pair peer-to-peer
  over a `BroadcastChannel`. Solo? A demo "Echo" peer replies so you can try everything.
- 🥷 **Stealth mode** — every message renders as a syntax-highlighted line of code with line
  numbers. **Tap any line to reveal the real English.**
- 🚨 **Panic key** — `Ctrl+Shift+.` instantly flips into a full fake VS Code (file explorer,
  tabs, editor, terminal, status bar). `Esc` to exit.

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
  supabaseTransport.ts Cloud: profile lookup, DM, history, realtime, send
supabase/schema.sql    tables + RLS + get_or_create_dm RPC
```

## Cloud mode — Google login + saved history (built in ✅)

Set two env vars and Solink automatically upgrades from Demo mode to **Cloud mode**:
Google sign-in, global usernames, and chat history saved in Supabase — still end-to-end
encrypted (the DB stores only ciphertext).

- Demo mode ↔ Cloud mode is decided by `hasSupabase` in `lib/supabaseClient.ts`.
- Cloud transport (`lib/supabaseTransport.ts`) implements the same `ChatTransport` interface
  as the demo one, so the UI (`components/ChatShell.tsx`) is identical in both modes.

👉 **Full step-by-step setup: [`SETUP-CLOUD.md`](SETUP-CLOUD.md)** (create the Supabase
project, run `supabase/schema.sql`, enable Google auth, add your keys to `.env.local`).

## Note

This is a fun/educational project. The disguise is presentation-only; treat the crypto as a
learning implementation rather than an audited secure-messaging product. It does not
provide Signal-style forward secrecy or automatic peer safety-number verification.
