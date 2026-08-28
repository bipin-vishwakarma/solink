# Solink releases

Solink uses semantic versions for user-visible web releases. Keep
`package.json`, `package-lock.json`, and `lib/appVersion.ts` aligned in every
release pull request. Already-open web and installed-PWA sessions poll the
uncached `/version.json` endpoint and offer an Update button when its version
differs from their bundled version.

## 0.2.3 - 2026-08-27

- Build custom WhatsApp/Telegram-style waveform voice player (`VoiceNotePlayer`)
  replacing native HTML `<audio controls>` with interactive waveform scrubbing,
  duration countdown, and `1x / 1.5x / 2x` speed controls.
- Position copy feedback directly above the typing bar with spring entrance animation,
  tracking the on-screen keyboard height dynamically.
- Implement WhatsApp-grade keyboard persistence: wrap composer in form submission,
  block blur at `onTouchStart`, and allow natural keyboard dismiss when scrolling
  or tapping the message history.
- Add live animated audio waveform equalizer bars and pulsing glow rings during
  voice recording.

## 0.2.2 - 2026-08-27

- Keep mobile on-screen keyboard open across multiple message sends by preventing
  Send button focus theft, adding synchronous textarea refocusing, and setting
  `enterKeyHint="send"`.
- Prevent accidental browser text selection and native OS copy callouts on long
  press by disabling touch callout and selection highlights on message bubbles.
- Add mobile message action sheet portal triggered on long-press (450ms) with
  quick emoji reactions, copy text, reply, and unsend actions.
- Provide visual feedback on copy with green checkmark state and floating toast pill.
- Add dismiss button to in-chat search and real-time offline status indicator.

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
