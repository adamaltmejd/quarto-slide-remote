# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — phone UI

- **Slide position (`N / total`) centered in the header bar.** Previously
  top-left of the body. Header is now a 3-column grid (`1fr auto 1fr`):
  `[● status]` left, `[N / total]` centered, `[peer · room · size · ↻]`
  right. The position sits at the true screen-center regardless of how
  wide the side groups grow.
- **Wall clock + elapsed timer combined** in a single row above NEXT.
  Format: `HH:MM | MM:SS` — local 24h clock, then talk-elapsed timer.
  Grey on the controls panel, no border, font-size matching NEXT
  (24 px). Tap anywhere on the row resets the elapsed half; the wall
  clock is read-only. Both removed from the header to free space.
- **Slide title and Next: row larger.** `.sr__title-text` 22 → 28 px,
  `.sr__next` 14 → 17 px. Readable from podium distance without
  reaching for the phone.
- **Empty-notes slides leave the notes pane empty** instead of
  rendering a "No notes for this slide." placeholder. Absence of text
  is its own signal; the placeholder reads as noise.

### Documentation

- **README install path reshaped.** Worker prerequisite is now stated
  up front — `quarto add` alone isn't enough; you also need a Worker
  URL. The shared `slide-remote.adamaltmejd.workers.dev` Worker is
  clearly marked **evaluation only** with no support guarantees.
  "Deploy your own Worker (recommended)" is a first-class section
  with `bunx wrangler login` + `bun run deploy`, separated from the
  contributor dev-loop instructions. Free Cloudflare account is
  sufficient.
- **README troubleshooting** updated: wake-lock no longer says
  "v0.2 roadmap" (shipped). Test-count line generalised so it doesn't
  drift on every release.

## [0.2.0] - 2026-04-27

### Changed — deck UI lives invisibly while paired

- **Status badge moved to top-right** (was bottom-right) so it never
  collides with reveal.js's bottom-right `slideNumber` widget that
  consumers commonly enable.
- **Badge is hidden in steady state** when paired. It only appears for
  `reconnecting` / `disconnected` / `failed`, where the presenter actually
  needs to see something is wrong. The deck looks untouched while the
  system is working.
- **Pairing overlay now shows a clickable join URL** ("open on this
  device") below the QR. Useful for laptop-only test runs and as a
  fallback when phone cameras struggle to read the QR.

### Added — phone speaker companion polish

- **Elapsed timer** in the phone top bar. The deck plugin starts a clock
  on first user navigation (Reveal `slidechanged`), ships it as
  `startedAt` in every snapshot, and the phone formats it `mm:ss`.
  Tap-to-reset sends a new `cmd: 'resetTimer'` which the deck applies
  and re-broadcasts, so multiple paired phones agree on the value
  without each maintaining its own clock.
- **Re-pair affordance** (small ↻ button at the right of the top bar).
  Stops the WebSocket, releases the wake lock, clears the stored
  session token, and replaces the body with "scan a fresh QR". Builds
  on the already-exported `clearSession()`.
- **Connection toast.** Transient banner above the title surfaces the
  `reconnecting…`, `reconnected`, and `failed` transitions louder than
  the colored status dot. Auto-dismisses after 2.5 s for transients;
  sticks for `failed` so the presenter doesn't miss the terminal state.
- **PWA polish.** App icon (vector — `pwa/icon.svg`) wired through
  `apple-touch-icon`, `<link rel=icon>`, and the manifest icons array
  with `purpose: any` and `purpose: maskable`. Manifest gains
  `description`, `orientation: portrait`, and `scope`. iOS 16+ accepts
  SVG apple-touch-icons; older iOS falls back to a generic Safari icon
  (acceptable for v0.x).
- **Phone UI layout overhaul.** Dominant full-width NEXT button with PREV
  and PAUSE sharing a 50/50 row beneath it. Stronger title hierarchy
  (current slide bold and full-color, next-slide title prefixed `Next:`
  and dimmed). Notes panel is independently scrollable with momentum
  scrolling so long notes never push the action buttons off-screen. The
  body itself no longer scrolls.
- **Notes text-size +/− controls** in the top bar, persisted in
  `localStorage` (`slide-remote.notes-size`). Five steps from 0.85× to
  1.5×; default 1×. Buttons disable at the rail ends.
- **`touch-action: manipulation`** on every action and size button, so
  rapid NEXT-tapping never accidentally pinch-zooms the phone UI. The
  viewport meta intentionally keeps `user-scalable=yes` for accessibility.
- **PAUSE → black-screen** wired. The phone PAUSE button now sends
  `cmd: 'black'`, which the deck plugin already dispatches via
  `Reveal.togglePause()`. The button reflects the deck's `isPaused`
  state from the snapshot — flips to `RESUME` and changes color while
  the deck is paused.
- **Screen wake lock** while paired. `navigator.wakeLock.request('screen')`
  is acquired on `connected` and released on `failed` (browsers
  auto-release on tab hide; we re-acquire on `visibilitychange`). Silent
  no-op where the API isn't available. Prevents iOS Safari from putting
  the screen to sleep mid-talk and dropping the WebSocket. Lives in
  `packages/phone-ui/src/wake-lock.ts`.

### Protocol

- **`Command` union extended with `'resetTimer'`** — viewer→presenter
  message that resets the deck's `startedAt` and triggers a fresh
  snapshot.
- **`SlideState.startedAt?: number`** — epoch ms of the deck's first
  navigation. Undefined until the presenter advances at least once.

### Tooling

- `bun test` is now **84 tests across 9 files** (was 65 across 7). New
  suites: `render.test.ts` covers the layout, PAUSE↔isPaused reflection,
  next-row hide-when-empty, notes-size persistence, the elapsed timer,
  the re-pair flow, and the connection toast; `wake-lock.test.ts`
  covers acquire/release/error paths with a fake `navigator.wakeLock`.
  `extract.test.ts` and the protocol round-trip suite cover the new
  `startedAt` field and `resetTimer` command.

## [0.1.1] — 2026-04-27

Documentation patch. The hardening listed below landed in the v0.1.0
tagged commit (after a pre-publish review pass) but was missed by the
v0.1.0 release notes. v0.1.1 makes the CHANGELOG faithful so v0.2 work
has a clean baseline. **No runtime changes vs. v0.1.0** — the v0.1.1
source tree is identical to v0.1.0's apart from this CHANGELOG entry.

### Hardened (already present in v0.1.0)

- **Kill switch** via `<meta name="slide-remote-enabled" content="false">`
  and silent bail-out when `worker-url` is empty. Both promised in
  README/CHANGELOG for v0.1.0; the actual checks now live in
  `packages/deck-plugin/src/config.ts`.
- **Reconnect ceiling** (`MAX_RECONNECT_ATTEMPTS = 60`, ≈15 minutes once
  the cap is reached) on both the deck client and the phone viewer,
  surfacing a new `'failed'` status instead of spinning indefinitely
  against a permanently-broken worker.
- **Strict h1 > h2 > h3 title priority.** The previous comma-selector
  returned whichever heading appeared first in DOM order; a deck with
  `<h2>` before `<h1>` would title as the h2.
- **Phone Content-Security-Policy meta** as defense-in-depth on the
  notes `innerHTML` render path (`script-src 'self'`, `connect-src
  'self' ws: wss:`, `object-src 'none'`).
- **Notes overflow rules** on the phone: `<pre>` scrolls horizontally,
  long unbroken tokens wrap, inline images cap at 100% width.
- **Constant-time token compare** in `RoomDO` (`tokensEqual`). Theoretical
  hardening — tokens are 128-bit random — but it removes the discussion.
- **Stale localStorage cleanup** in the phone session: a roomId mismatch
  now removes the entry instead of leaving it to ferment between talks.
- **`applyRemoteCommand` extracted** as a pure exported function so command
  dispatch is unit-testable without the full mint + WS flow.

### Tooling (already present in v0.1.0)

- `bun test` is **65 tests across 7 files** (was 40 across 3 in the
  v0.1.0 release notes). New suites: `client.test.ts`, `config.test.ts`,
  `session.test.ts`, plus extra `extract.test.ts` cases for heading
  priority.
- `scripts/check-decktape-silent.ts` now exercises **3 bail-out
  scenarios** in one process: decktape `?handout=true`, missing
  `worker-url`, and the `slide-remote-enabled="false"` kill switch.

## [0.1.0] — 2026-04-27

Initial public release. iPhone-driven remote control + speaker-notes
companion for static reveal.js decks. No software install on the venue PC
beyond opening the deck URL.

### Added

- **Quarto extension** at `_extensions/slide-remote/` contributing a
  reveal.js plugin and a Lua filter. Consumers install with
  `quarto add adamaltmejd/quarto-slide-remote` and reference both the
  plugin and the filter by extension name in their format YAML.
- **Cloudflare Worker + Durable Object** brokering WebSocket messages
  between the deck and the phone. One-token auth, hibernation API,
  snapshot persistence in DO storage so late-joining viewers see the
  current slide.
- **Deck plugin** (TS, IIFE bundle): silent by default; activates on
  `?remote=1`, **Shift+R**, or an opt-in corner button. Pairing overlay
  with QR code, status badge, WebSocket client with exponential
  reconnect/backoff.
- **State extraction** from Reveal — title, indices, allowlist-sanitized
  notes, next-slide title, fragments-left.
- **Phone UI** (plain TS + DOM): viewer client, prev/next buttons,
  notes display, reconnect, `localStorage` session, hash-token capture
  with history stripping.
- **Theme independence** as a hard invariant — plugin uses only Reveal's
  public API and standard DOM contract; CSS scoped under `.sr-*`.
- **Notes sanitizer** with an allowlist of structural and inline tags
  and an explicit `DROP_TAGS` set so `<script>`, `<style>`, `<svg>`,
  `<math>`, etc. are dropped entirely instead of unwrapped.
- **Silent-during-decktape invariant** — `?print-pdf`, configured
  `disable-on-params`, `<meta name="slide-remote-enabled" content="false">`,
  and `navigator.webdriver` all bail out before any socket/UI/keydown
  listener is created.

### Quality and tooling

- `bun test` unit suite (sanitize, extract, protocol round-trip) running
  under happy-dom — 40 tests.
- `bun run test:smoke` integration suite that boots `wrangler dev`
  itself and exercises the WS protocol over real sockets, including
  raw-TCP probes for upgrade-rejection (which side-step
  [bun#11706](https://github.com/oven-sh/bun/issues/11706) /
  [bun#5951](https://github.com/oven-sh/bun/issues/5951)).
- `scripts/check-decktape-silent.ts` asserts the silent invariant in
  CI: no WebSocket constructed, no DOM mutations, no keydown listeners,
  no console writes when loaded with `?handout=true`.
- Minified release build via `bun run build:plugin:min`; bundle-size
  budget of 30 KB gzip enforced by `scripts/size-check.ts` (current:
  ~11 KB gzip).
- Pre-commit hook tracked in-repo at `.githooks/`; activate locally with
  `bun run hooks:install`.
- GitHub Actions CI running unit, integration, and decktape-silent jobs.
- Biome 2 lint + format with zero warnings/infos at release.

### Fixed and tightened (post-review polish)

- **Phone wake lock** — `release()` removes its `visibilitychange`
  listener; `tryRequest()` drops a sentinel resolved during a release
  window instead of latching onto a dead lock.
- **Phone WS** — `stop()` removes its `online` listener.
- **Pairing overlay** — Escape keydown listener bound only while
  mounted; QR SVG cached against the join URL so reopens skip the
  regeneration when nothing changed.
- **Phone snapshot hot path** — timer textContent and notes
  `innerHTML` are diff-guarded; per-second ticks and per-snapshot
  writes no-op when unchanged. Notes subtree is no longer torn down
  on fragment toggles or `resetTimer`.
- **`bun run demo`** — pre-probes `:8787` / `:5174` and fails fast
  with an `lsof` hint instead of hanging 30 s when an orphan from a
  prior run is bound. Skips the redundant initial build when watch
  is enabled. Worker readiness probe switched from `POST /api/room/new`
  (minted orphan rooms each retry) to `GET /`.

[Unreleased]: https://github.com/adamaltmejd/quarto-slide-remote/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/adamaltmejd/quarto-slide-remote/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/adamaltmejd/quarto-slide-remote/releases/tag/v0.1.1
[0.1.0]: https://github.com/adamaltmejd/quarto-slide-remote/releases/tag/v0.1.0
