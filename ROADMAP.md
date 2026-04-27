# Roadmap

Working toward a stable, publishable v0.1 release. Items above the current
working state are stable and shipped; items below describe what's still open.

Current state: **v0.1.0-rc** — MVP works end-to-end against a deployed Worker;
quality + tooling and documentation are in place. Remaining work before
tagging v0.1.0 is the GitHub push, the annotated tag, and switching the
EC7422 consumer over to the published `quarto add`.

---

## v0.1 — Release-ready MVP

The MVP itself is functional. To declare v0.1.0 done, fill in the engineering
quality and packaging items below.

### Done

- [x] Quarto extension: `_extensions/slide-remote/` with revealjs-plugin + filter contributions
- [x] Cloudflare Worker + Durable Object (RoomDO) with one-secret auth, hibernation API, snapshot persistence
- [x] Deck plugin: silent by default; `?remote=1` / `Shift+R` activation; QR pairing overlay; corner status badge; WS client with reconnect/backoff
- [x] State extraction: title, indices, notes (allowlist-sanitized), next-slide title, fragments-left
- [x] Phone UI: viewer client, layout, prev/next, reconnect, localStorage session, hash-token capture and stripping
- [x] End-to-end smoke test (`packages/worker/test/integration.test.ts`, gated by `SR_INTEGRATION=1`)
- [x] Theme-independence: plugin uses only Reveal's public API and standard DOM contract; CSS scoped under `.sr-*`
- [x] Worker deployed (`slide-remote.adamaltmejd.workers.dev`) and consumer wired in EC7422 lectures
- [x] Notes sanitizer drops dangerous container tags (`<style>`, `<script>`, `<svg>`, `<math>`, …)

### Quality and tooling — done

- [x] `lint` (`biome check`), `format` (`biome check --write`), `test` (`bun test`), `size`, `test:smoke` package scripts
- [x] `bun test` + happy-dom unit tests:
  - [x] `sanitize.ts` — `<style>` leak regression, allowlist, `data:image/` only on `img.src`, `javascript:` blocked everywhere (20 tests)
  - [x] `extract.ts` — title fallback chain, 64 KB notes cap, next-slide title across vertical/horizontal stacks (13 tests)
  - [x] `protocol/index.ts` — JSON round-trip across SlideState / ClientMessage / ServerMessage (7 tests)
- [x] `packages/worker/test/integration.test.ts` — boots `wrangler dev` itself; gated by `SR_INTEGRATION=1` so default `bun test` stays fast. Six cases covering room mint, presenter↔viewer round-trip, viewer→presenter `cmd` forwarding, role enforcement, late-viewer snapshot replay, and a raw-TCP `probeUpgradeStatus()` for 401/101 auth checks (sidesteps bun#11706 / bun#5951)
- [x] Pre-commit hook via `git config core.hooksPath .githooks` (`bun run hooks:install`); `.githooks/pre-commit` runs lint + typecheck + tests
- [x] GitHub Actions CI (`.github/workflows/ci.yml`): three jobs — `unit` (lint → typecheck → bun test → build → size), `integration` (`bun run test:smoke`), `decktape-silent` (assert no socket / DOM / console writes under `?handout=true`)
- [x] Bundle-size budget at 30 KB gzip enforced by `scripts/size-check.ts` (current minified bundle: 30 KB raw / **11.4 KB gzip**)
- [x] Minified release build via `bun run build:plugin:min`; `bun run deploy` uses it before `wrangler deploy`
- [x] Decktape-silent assertion via `scripts/check-decktape-silent.ts` (happy-dom env, eval'd IIFE, asserts wsCount == 0, no body mutations, no keydown listener, no console writes)

### Documentation and packaging

- [x] LICENSE file (MIT)
- [x] CHANGELOG.md (Keep-a-Changelog style; v0.1.0 entry)
- [x] Expanded README: install steps, YAML config table, road-test flow, troubleshooting, theme-independence note, project layout, CI badge
- [ ] Push the repo to GitHub (`adamaltmejd/quarto-slide-remote`)
- [ ] Tag `v0.1.0` and verify `quarto add adamaltmejd/quarto-slide-remote@v0.1.0` resolves cleanly in a fresh consumer
- [ ] Switch the EC7422 course repo from dev-install to `quarto add` once the tag is live; remove the gitignore line

---

## v0.2 — Speaker companion polish (Phase 3)

Adds the "feels like a clicker" features. Each is small enough to ship alone.

### Phone UI layout overhaul

The current symmetric prev/next layout is wrong for a talk: NEXT is the
overwhelmingly common action and should never miss, even while
fast-tapping. Target shape:

```
┌────────────────────────────────────┐
│ status · room                      │   top bar
├────────────────────────────────────┤
│ Current slide title (large)        │
│ Next: upcoming slide title (dim)   │
│                                    │
│ Notes…                             │
├────────────────────────────────────┤
│                                    │
│              NEXT                  │   primary, dominant target
│                                    │
├──────────────────┬─────────────────┤
│       PREV       │      PAUSE      │   secondary, share a row
└──────────────────┴─────────────────┘
```

- [ ] **Bigger NEXT button**: full-width, the dominant target on screen — visibly larger than the PREV/PAUSE row. Final size is a tuning question; pick by feel on a real phone, balancing thumb reach against notes-area room. Haptic-friendly.
- [ ] **PREV + PAUSE share a row** below NEXT, each taking half-width. PAUSE is the black-screen toggle (`cmd: 'black'`).
- [ ] **Disable double-tap-zoom**: add `touch-action: manipulation` on the action buttons (and probably the controls row) so rapid NEXT-tapping never accidentally pinch-zooms the phone UI. Avoid `user-scalable=no` on the viewport meta — that hurts accessibility.
- [ ] **Stronger title hierarchy**: current slide title visually dominant (larger weight, full-color); next-slide title appears immediately under it, clearly secondary (smaller, dimmer, prefixed e.g. "Next:"). Both legible at arm's length, but unmistakably differentiated. Tighten existing notes-area styling to give the title block more presence.
- [ ] **Notes box overflow and text size**: with controls taking a chunk of the viewport, the notes panel must be independently scrollable (not the whole body), with momentum scroll and visible scroll affordance. Set a sensible default text size for arm's-length reading; offer +/− controls (or pinch-on-the-notes-area only) to adjust, persisted in localStorage. Long unbroken tokens (URLs, long words, code) should wrap; overflow-x must never exceed the viewport.

### Other polish

- [ ] **Black-screen toggle**: phone button → `cmd: 'black'` → `Reveal.togglePause()`. Verify the deck's `.reveal.paused` style renders as actual black against `datascience-theme.scss`; add a self-scoped overlay rule if needed.
- [ ] **Elapsed timer**: starts on first navigation, `mm:ss`, tap to reset. Persisted across phone reconnect via `startedAt` in the snapshot so multiple viewers agree.
- [ ] **Wake lock**: `navigator.wakeLock.request('screen')` while paired; release on visibility change. Critical for iOS Safari + Low Power Mode.
- [ ] **PWA polish**: real apple-touch-icon, app icons in `manifest.webmanifest`, theme-color, dark/light splash.
- [ ] **Re-pair affordance on phone**: a small "re-pair" link that clears localStorage and shows a "scan a fresh QR" message.
- [ ] **Connection toast**: a momentary banner on the phone when the deck disconnects/reconnects, instead of just a status dot.

---

## Beyond v0.2

- [ ] **Jump-to-slide / overview**: phone shows the slide list (title + thumb-friendly tap targets); selecting one sends `cmd: 'goto'`. Useful when the talk goes off-script.
- [ ] **Haptic feedback**: short tap when `cmd` is acknowledged (`navigator.vibrate` is iOS-limited; explore `expo-haptics`-style alternatives or accept Android-only).
- [ ] **Token regeneration**: presenter shortcut (Shift+T?) to mint a new room mid-talk if a phone walked off with the old QR.
- [ ] **Read-only viewer mode**: optional `?role=watch` for a participant who can see notes but not drive.
- [ ] **Service worker**: for offline phone-UI caching after first load. Defer until we hit a real flake; risks more than it solves.
- [ ] **Apple Watch companion**: explicit non-goal for v0.x; revisit if the phone-as-clicker UX has friction in real talks.
- [ ] **Telemetry**: minimal counters (rooms minted, commands sent, errors) so we can see real-world usage without storing presentation content.
- [ ] **Idle DO cleanup**: alarm-driven 24h TTL is sketched but not wired in `RoomDO`; add it when usage justifies the cost discipline.

### Plugin performance

- [ ] **Lazy-load the QR library** in `packages/deck-plugin`. `qrcode-generator` (~50 KB raw, the bulk of the bundle) only runs when a presenter opens the pairing overlay, but it currently parses on every deck load. Move it behind a dynamic `import()` inside `Overlay.open()` (or the controller's `activate()` path) so the 99% non-paired case pays nothing. Coordinate with the size-check budget — the main bundle drops, the QR chunk loads on demand.
- [ ] **Cache sanitized notes per slide.** `sanitizeNotesHtml` runs on every `pumpStateNow`, including `fragmentshown`/`fragmenthidden` events on a slide whose notes haven't changed. Add a `WeakMap<Element, string>` keyed by the slide element so notes are sanitized once per slide. Invalidate naturally when the deck re-renders (WeakMap drops detached nodes). Worth the change for note-heavy decks where sanitization shows up in the flush-state hot path.

---

## Risks and known issues

Tracked here so we don't forget; not in any priority order.

- **iOS Safari + Low Power Mode** drops WebSockets aggressively when the screen sleeps. Wake lock + fast reconnect helps but the screen-off → screen-on cycle needs explicit testing on a real device.
- **`Reveal.togglePause()` styling** depends on `.reveal.paused`. Custom themes (e.g. `datascience-theme.scss`) may not render a true black; verify before relying on it for the black-screen feature.
- **DO SQLite + `new_sqlite_classes` migrations are one-way.** Pin compat date carefully and version any migration changes.
- **`presenterToken` in URL hash** keeps it out of server logs but lands in browser history. Acceptable for v0.1; document that "anyone with the QR can drive the deck" and revisit with token regeneration in v0.2.
- **`/api/room/new` CORS** is currently `*`. Fine for now (the endpoint mints empty rooms; it's not abuse-worthy), but constrain to the deck's origin once deploying for real.
- **`quarto add` resolves to a git tag**, not `main`. Release discipline matters; CI must create tags for every release.
- **Bundle size**: 64 KB unminified is fine for dev but bloats the deck. Minify and gzip-budget before tagging v0.1.
- **Notes sanitization** has a regression for `<style>` leakage that's now fixed; add it to the test suite before further changes.
- **Course repo CI**: the existing `publish-course-material.yml` workflow renders decks with the plugin loaded. Confirm decktape's `?handout=true` keeps the plugin silent in CI; promote that check from a manual one to an asserted one.
