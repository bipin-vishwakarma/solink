# Solink Next Version Plan: v0.2.2 / v0.3.0

> **Strategy**: Atomic release. All features, UX improvements, and fixes are developed and verified step-by-step on this focused branch, then deployed together in a single release.

---

## 1. Git & Version Baseline Analysis

| Property | Value |
|---|---|
| **Current Git Branch** | `codex/add-browser-e2e` (feature branch) |
| **Current Release Version** | `0.2.1` (`package.json`, `package-lock.json`, `lib/appVersion.ts`) |
| **Target Release Version** | `0.2.2` (Mobile UX & Reliability Release) |
| **Automated Test Status** | 8 test suites, 38 unit & cryptographic tests passing, clean build |
| **Guardrails (`AGENTS.md`)** | E2E encryption intact; Zero plaintext leaks; Mobile-first accessibility; Atomic release approval |

### Current State (v0.2.1 Baseline)
- **Encryption & Sync**: Pairwise ECDH + AES-GCM for DMs and small groups; IndexedDB offline ciphertext outbox; Supabase Cloud transport with RLS.
- **PWA & Viewport**: Custom `ViewportManager` syncing `--app-height` and `--kb` with `visualViewport`.
- **Header Actions**: Mobile chat header options sheet rendered in a portal above stacked contexts (shipped in v0.2.1).

---

## 2. Identified Bugs & Friction in v0.2.1

### Issue A: Virtual Keyboard Dismisses on Every Send (Mobile)
- **Cause**: Tapping the `<button aria-label="Send">` causes the mobile browser to blur the `<textarea>`. Because `submit()` clears text (`setText("")`) and never restores focus, the Send button is unmounted from the DOM and replaced with the Voice Note button. The mobile OS sees that no input has focus and slides the keyboard down.
- **Status**: [x] Fixed in `components/Composer.tsx`.

### Issue B: Accidental Long-Press Triggers Native Browser Text Selection
- **Cause**: Message text in `MessageBubble.tsx` lacked `select-none` (`user-select: none; -webkit-touch-callout: none;`).
- **Status**: [x] Fixed in `components/MessageBubble.tsx` with `select-none`, `[-webkit-touch-callout:none]`, and `onContextMenu` interception.

### Issue C: Mobile Users Cannot Copy, React, or Unsend Messages
- **Cause**: In `MessageBubble.tsx`, the action buttons (`Copy`, `React`, `Unsend`, `Reply`) were styled with `opacity-0 group-hover:opacity-100`, which is inaccessible on mobile touch screens.
- **Status**: [x] Fixed in `components/MessageBubble.tsx` with a mobile action sheet portal triggered on long-press (450ms).

### Issue D: Textarea Lacked `enterKeyHint="send"`
- **Cause**: The `<textarea>` did not signal mobile virtual keyboards that the primary action is "send".
- **Status**: [x] Fixed in `components/Composer.tsx`.

---

## 3. Step-by-Step Implementation Record

### Step 1: Mobile Keyboard Flow & Scrollbar Polish (`components/Composer.tsx`, `app/globals.css`)
- [x] **Persistent Action Button (Zero DOM Unmounting)**: Replaced conditional `<button>` DOM swapping with a single persistent button node that switches icons. Prevents mobile browsers from discarding the active touch target and dropping focus on send.
- [x] **Touch End Interception**: Added `onTouchEnd={(e) => { e.preventDefault(); submit(); }}` to prevent mobile Safari blur upon finger lift.
- [x] **Eliminate 0px Height Collapse**: Textarea auto-grow no longer collapses to `height: 0px` on clear (which triggered browser blur when the active element shrank to 0).
- [x] **Dual-Tick Focus Pinning**: Calls `taRef.current.focus()` synchronously and in `requestAnimationFrame`.
- [x] **Remove Vertical Dash (Scrollbar Thumb)**: Suppressed WebKit/standard scrollbars on `<textarea>` in CSS (`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`), completely removing the gray vertical dash that appeared to the left of the voice button.
- [x] **Configure Virtual Keyboard Action**: Added `enterKeyHint="send"` to `<textarea>`.

### Step 2: Prevent Accidental Selection & Copy UX (`components/MessageBubble.tsx`)
- [x] **Disable Native Long-Press Text Selection**: Applied `select-none` and `[-webkit-touch-callout:none]` to message bubble containers.
- [x] **Preserve Clickable Links**: Kept `<Linkified>` interactive.
- [x] **Copy Feedback Toast & Icon State**: Added visual checkmark state on the copy button and a top-floating `"Copied to clipboard"` pill via `createPortal`.

### Step 3: Mobile Message Action Sheet (`components/MessageBubble.tsx`)
- [x] **Touch & Long-Press Detection**: 450ms hold detection with movement threshold (>10px cancels so scrolling/swiping works smoothly).
- [x] **Haptic Feedback**: Calls `navigator.vibrate?.(20)` on trigger.
- [x] **Bottom Action Sheet Portal**:
  - Quick emoji reactions (❤️ 👍 😂 😮 😢 🙏)
  - Copy message text
  - Swipe or tap to reply
  - Unsend message (for sender's messages)

### Step 4: UI & Resilience Polish (`components/ChatShell.tsx`)
- [x] **In-Chat Search Close Button**: Added dedicated `✕` dismiss button to the in-chat search input bar.
- [x] **Offline Status Banner**: Tracks `navigator.onLine` and renders a clean offline notice above the composer when disconnected.

---

## 4. Verification & Testing

- [x] `npm run typecheck` (`tsc --noEmit`) - passed.
- [x] `npm run lint` (`eslint .`) - passed.
- [x] `npm test` (`vitest run`) - 8 test files, 38/38 tests passed.
- [x] `npm run build` (`next build`) - successful production Turbopack build.
- [x] `git diff --check` - zero whitespace or merge conflict errors.

---

## 5. Deployment Checklist (Deploy At Once)

When ready to finalize and deploy the release:

1. **Version Bump**:
   - `package.json` -> `0.2.2`
   - `package-lock.json` -> sync via `npm install --package-lock-only`
   - `lib/appVersion.ts` -> `"0.2.2"`
   - `docs/RELEASES.md` -> Add `0.2.2` release notes
2. **Git Review**:
   - `git diff`
   - `git status --short`
   - Commit with Conventional Commit: `fix: stabilize mobile keyboard and message interactions`
3. **User Approval Gate**:
   - Explicit user approval required before pushing to remote or triggering production deployment.
