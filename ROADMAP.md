# Roadmap

**Status:** v0.1.1 shipped 2026-04-27 at
[github.com/adamaltmejd/quarto-slide-remote](https://github.com/adamaltmejd/quarto-slide-remote)
(public, MIT, Worker live at `slide-remote.adamaltmejd.workers.dev`).
v0.2 work starts here.

The MVP is functional end-to-end: deck → QR → phone → WS → Worker →
Durable Object. Quality gates (biome lint, tsc typecheck, 65 unit tests,
integration smoke test, 3-scenario decktape-silent invariant, 30 KB gzip
bundle budget) run in CI on every push. The full v0.1 ledger — what's
implemented, hardened, and tested — lives in [CHANGELOG.md](CHANGELOG.md).

---

## v0.1 — open item

- [ ] Switch the EC7422 course repo from `dev-install` to
      `quarto add adamaltmejd/quarto-slide-remote@v0.1.1` and drop the
      `_extensions/slide-remote/` entry from its `.gitignore`. Lives in
      the consumer repo, not this one.

---

## v0.2 — Speaker companion polish

The "feels like a clicker" features. Each item is small enough to ship
alone — pick one off the list.

### Suggested order

The phone UI layout overhaul, the black-screen toggle, and the wake lock
shipped together (the new layout's PAUSE button *is* the black-screen
toggle, and wake lock is a one-liner with outsized value for iOS).
Remaining items are order-agnostic.

1. ~~Phone UI layout overhaul (below)~~ — shipped Unreleased
2. ~~Black-screen toggle — wire the PAUSE button to `cmd: 'black'`~~ — shipped Unreleased
3. ~~Wake lock — `navigator.wakeLock.request('screen')` while paired~~ — shipped Unreleased
4. Re-pair affordance — surface the already-exported `clearSession()`
5. Elapsed timer
6. Connection toast
7. PWA polish

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

- [x] **Bigger NEXT button**: full-width, the dominant target on screen — 96 px tall, blue, visibly larger than the 60 px PREV/PAUSE row.
- [x] **PREV + PAUSE share a row** below NEXT, each taking half-width. PAUSE sends `cmd: 'black'`.
- [x] **Disable double-tap-zoom**: `touch-action: manipulation` on every action and size button. Viewport meta still allows pinch-zoom for accessibility.
- [x] **Stronger title hierarchy**: current slide bold and full-color; next-slide row prefixed `Next:` and dimmed. Hides when there's no next slide.
- [x] **Notes box overflow and text size**: notes pane is the only scrollable region (the body is locked to `100dvh` and `overflow: hidden`). +/− controls in the top bar drive a five-step CSS scale, persisted in `localStorage` under `slide-remote.notes-size`.

### Other polish

- [x] **Black-screen toggle**: phone PAUSE button → `cmd: 'black'` → `Reveal.togglePause()`. Button reflects the deck's `isPaused` state from snapshots and flips to `RESUME` while paused.
- [ ] **Elapsed timer**: starts on first navigation, `mm:ss`, tap to reset. Persisted across phone reconnect via `startedAt` in the snapshot so multiple viewers agree.
- [x] **Wake lock**: `navigator.wakeLock.request('screen')` while connected; auto-released by browsers on tab hide; re-acquired on `visibilitychange` → `visible`. Silent no-op when the API is unavailable.
- [ ] **PWA polish**: real apple-touch-icon, app icons in `manifest.webmanifest`, theme-color, dark/light splash.
- [ ] **Re-pair affordance on phone**: a small "re-pair" link that calls `clearSession()` (already exported from `phone-ui/src/session.ts`) and shows a "scan a fresh QR" message.
- [ ] **Connection toast**: a momentary banner on the phone when the deck disconnects/reconnects, instead of just a status dot. Especially useful to surface the new `'failed'` terminal state more loudly than the dot color.

---

## Beyond v0.2

- [ ] **Badge fade-and-flash transitions** (queued for ~v0.4). Today the badge is hidden while connected and visible (red/yellow) on disconnect/reconnecting/failed; transitions are instant. Add a green "paired" flash on first connect *and* every reconnect, holding for ~2.5 s then fading to invisible over ~600 ms. Disconnect/failed states stay sticky red. Pure CSS-transition + `setTimeout`; no protocol change. Position is already top-right (collides with neither reveal.js's bottom-right `slideNumber` nor a consumer's bottom-left status widgets).
- [ ] **Jump-to-slide / overview**: phone shows the slide list (title + thumb-friendly tap targets); selecting one sends `cmd: 'goto'`. Useful when the talk goes off-script.
- [ ] **Haptic feedback**: short tap when `cmd` is acknowledged (`navigator.vibrate` is iOS-limited; explore `expo-haptics`-style alternatives or accept Android-only).
- [ ] **Token regeneration**: presenter shortcut (Shift+T?) to mint a new room mid-talk if a phone walked off with the old QR.
- [ ] **Read-only viewer mode**: optional `?role=watch` for a participant who can see notes but not drive. Note that the worker doesn't currently enforce single-presenter (see protocol comment in `packages/protocol/src/index.ts`); read-only would need an actual role check in `RoomDO.webSocketMessage`.
- [ ] **Service worker**: for offline phone-UI caching after first load. Defer until we hit a real flake; risks more than it solves.
- [ ] **Apple Watch companion**: explicit non-goal for v0.x; revisit if the phone-as-clicker UX has friction in real talks.
- [ ] **Telemetry**: minimal counters (rooms minted, commands sent, errors) so we can see real-world usage without storing presentation content.
- [ ] **Idle DO cleanup**: alarm-driven 24h TTL is sketched but not wired in `RoomDO`; add it when usage justifies the cost discipline. Pairs naturally with constraining `/api/room/new` CORS.

### Plugin performance

- [ ] **Lazy-load the QR library** in `packages/deck-plugin`. `qrcode-generator` (~50 KB raw, the bulk of the bundle) only runs when a presenter opens the pairing overlay, but it currently parses on every deck load. Move it behind a dynamic `import()` inside `Overlay.open()` (or the controller's `activate()` path) so the 99% non-paired case pays nothing. Coordinate with the size-check budget — the main bundle drops, the QR chunk loads on demand.
- [ ] **Cache sanitized notes per slide.** `sanitizeNotesHtml` runs on every `pumpStateNow`, including `fragmentshown`/`fragmenthidden` events on a slide whose notes haven't changed. Add a `WeakMap<Element, string>` keyed by the slide element so notes are sanitized once per slide. Invalidate naturally when the deck re-renders (WeakMap drops detached nodes). Worth the change for note-heavy decks where sanitization shows up in the flush-state hot path.

---

## Risks and known issues

Tracked here so we don't forget; not in any priority order. Items resolved
in v0.1.x are dropped — see CHANGELOG for closeouts.

- **iOS Safari + Low Power Mode** drops WebSockets aggressively when the screen sleeps. The reconnect ceiling (`MAX_RECONNECT_ATTEMPTS = 60`) caps the spinner at ~15 minutes; wake lock + fast reconnect (both v0.2) help further, but the screen-off → screen-on cycle still needs explicit testing on a real device.
- **DO SQLite + `new_sqlite_classes` migrations are one-way.** Pin compat date carefully and version any migration changes.
- **`presenterToken` in URL hash** keeps it out of server logs but lands in browser history. Acceptable for v0.1; revisit with token regeneration in Beyond.
- **`/api/room/new` CORS** is currently `*` and unrate-limited. Fine for the current scale (the endpoint mints empty rooms; it's not abuse-worthy on its own), but constrain to the deck's origin and pair with idle DO cleanup before broader deployment.
- **`quarto add` resolves to a git tag**, not `main`. Release discipline matters; CI must create tags for every release. v0.1.0 + v0.1.1 followed this; future releases must too.
- **Course repo CI**: the consumer's `publish-course-material.yml` renders decks with the plugin loaded. Our own CI proves silence across 3 scenarios (decktape, missing worker-url, kill switch). Promote the consumer's check from a manual one to an asserted one when the cutover happens.
- **Multi-presenter is unenforced**: two presenter connections to the same room means last-write-wins on snapshots. Documented in `packages/protocol/src/index.ts`; `RoomDO.webSocketMessage` would need a role check to enforce single-presenter. Relevant for Beyond/read-only-viewer.
