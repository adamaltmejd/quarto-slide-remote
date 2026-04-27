# Roadmap

Working toward a stable, publishable v0.1 release. Items above the current
working state are stable and shipped; items below describe what's still open.

Current state: **v0.1.0-rc** — MVP works end-to-end against a deployed Worker.
Remaining work before tagging v0.1.0 is mostly quality and release hygiene.

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
- [x] One end-to-end smoke test (`scripts/ws-smoke.ts`)
- [x] Theme-independence: plugin uses only Reveal's public API and standard DOM contract; CSS scoped under `.sr-*`
- [x] Worker deployed (`slide-remote.adamaltmejd.workers.dev`) and consumer wired in EC7422 lectures
- [x] Notes sanitizer drops dangerous container tags (`<style>`, `<script>`, `<svg>`, `<math>`, …)

### Quality and tooling — open

- [ ] Add `lint` and `format` package.json scripts (biome 2 is installed but not scripted)
- [ ] Add `bun test` and write unit tests:
  - [ ] `sanitize.ts` — regression for the `<style>` leak; allowlist coverage; `data:image/` allowed only on `img.src`; `javascript:` blocked everywhere
  - [ ] `extract.ts` — title fallback chain; notes capping at 64 KB; next-slide title across vertical/horizontal stacks
  - [ ] `protocol/index.ts` — minimal type round-trip via JSON.parse/stringify
- [ ] Promote `scripts/ws-smoke.ts` into a runnable `bun test` integration suite that boots `wrangler dev` itself
- [ ] Pre-commit hook (lefthook or simple-git-hooks) running `biome check --write` + `tsc --noEmit`
- [ ] GitHub Actions CI: typecheck → lint → unit tests → build → smoke test against `wrangler dev`
- [ ] Bundle-size budget check in CI (deck plugin currently ~64 KB unminified; aim for <30 KB minified+gzip)
- [ ] Minify the deck-plugin IIFE in production builds (`bun build --minify`)
- [ ] Verify the plugin is silent during decktape PDF rendering in CI (load the rendered HTML headless with `?handout=true` and assert no socket / no DOM mutations)

### Documentation and packaging — open

- [ ] LICENSE file (MIT)
- [ ] CHANGELOG.md
- [ ] Expand README: consumer install steps, YAML config table, troubleshooting, theme-independence note
- [ ] Document the road-test flow (start `wrangler dev`/`deploy`, render deck, scan QR)
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
