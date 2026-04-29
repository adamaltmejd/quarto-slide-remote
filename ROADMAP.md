# Roadmap

**Status:** v0.5.0 shipped 2026-04-29 at
[github.com/adamaltmejd/quarto-slide-remote](https://github.com/adamaltmejd/quarto-slide-remote)
(public, MIT, Worker live at `slide-remote.adamaltmejd.workers.dev`).
Next release starts here.

The MVP is functional end-to-end: deck → QR → phone → WS → Worker →
Durable Object. Quality gates (biome lint, tsc typecheck, unit tests,
integration smoke test, 3-scenario decktape-silent invariant, 30 KB gzip
bundle budget) run in CI on every push. The full v0.1 / v0.2 / v0.3 /
v0.4 / v0.5 ledger — what's implemented, hardened, and tested — lives
in [CHANGELOG.md](CHANGELOG.md).

---

## v0.2 — Speaker companion polish

The "feels like a clicker" features. Each item is small enough to ship
alone — pick one off the list.

### Status

**Shipped 2026-04-27 as v0.2.0.** All seven items below landed.

1. ~~Phone UI layout overhaul (below)~~ — shipped
2. ~~Black-screen toggle — wire the PAUSE button to `cmd: 'black'`~~ — shipped
3. ~~Wake lock — `navigator.wakeLock.request('screen')` while paired~~ — shipped
4. ~~Re-pair affordance — surface the already-exported `clearSession()`~~ — shipped
5. ~~Elapsed timer~~ — shipped
6. ~~Connection toast~~ — shipped
7. ~~PWA polish~~ — shipped

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
- [x] **Elapsed timer**: starts on first navigation (Reveal `slidechanged`), `mm:ss`, tap to reset (sends `cmd: 'resetTimer'`). Rides every snapshot as `startedAt`, so multiple paired phones agree on the value.
- [x] **Wake lock**: `navigator.wakeLock.request('screen')` while connected; auto-released by browsers on tab hide; re-acquired on `visibilitychange` → `visible`. Silent no-op when the API is unavailable.
- [x] **PWA polish**: SVG `apple-touch-icon` and `<link rel=icon>`, manifest icons array (`any` + `maskable`), `description`, `orientation`, `scope`. Splash on Android is auto-derived from `theme_color` + `background_color` + icons. iOS startup images deferred (low value, fiddly per-device list).
- [x] **Re-pair affordance on phone**: ↻ button in the top bar; stops the WS, releases the wake lock, calls `clearSession()`, and replaces the body with a "scan a fresh QR" message.
- [x] **Connection toast**: transient banner above the title; auto-dismiss after 2.5 s for `reconnecting…` / `reconnected`, sticky for `failed`.

---

## v0.3 — Phone UI tightening + onboarding clarity

**Status:** shipped 2026-04-28 as v0.3.0 (six items) + v0.3.1 (room ID
dropped from phone header).

Cosmetic and ergonomic refinements based on real-talk usage of v0.2,
plus install docs that don't quietly assume the user can read minds
about the Worker dependency.

### Phone UI

- [x] **Slide number into the header.** Today `1 / 5` sits at the
      top-left of the body title row, competing with the slide title.
      Move it into `.sr__top` (alongside the status dot, room id, and
      size buttons) so the body block is just title + `Next:` + notes.
- [x] **Timer relocated above NEXT.** The header timer fights for
      space with status / peer / room / size / repair. Move it into
      the controls block, directly above the NEXT button. Style:
      grey text on the panel background, no border, no fill —
      same `font-size` as the NEXT button. Tap-to-reset still applies.
- [x] **Wall clock alongside the timer.** Format: `HH:MM | MM:SS` —
      local 24h clock first, talk-elapsed timer second. Lets the
      presenter glance at real time without breaking eye contact to
      look at a watch.
- [x] **Drop the "No notes for this slide" placeholder.** Leave the
      notes pane empty when there are no notes; absence-of-text is its
      own signal and the placeholder reads as noise.
- [x] **Bump heading + `Next:` font sizes.** `.sr__title-text`
      (currently 22 px) and `.sr__next` (currently 14 px) are sized
      for proximity reading; readable from arm's length matters more
      on a podium. Pick proportional bumps that don't break the
      layout on small screens.

### Onboarding / install

- [x] **Streamline the README install path** for self-hosters. Today
      the README jumps straight to `quarto add` and never makes it
      explicit that a Cloudflare Worker has to exist somewhere for any
      of this to work. Reshape it to:
  1. **State up front: a Worker URL is required.** The plugin is
     silent without one — that's a feature, but it surprises first-time
     installers who expect `quarto add` to be sufficient.
  2. **Offer a try-it shared Worker**
     (`slide-remote.adamaltmejd.workers.dev`) for evaluation only.
     Flag clearly that it's not rate-limited and is best-effort, may be retired
     or restricted at any time, and is **not** intended for ongoing
     use by other presenters.
  3. **Promote "Deploy your own Worker" to a first-class section.**
     Minimal `wrangler deploy` flow with a Cloudflare account, no
     paid plan required. Today the deploy commands are mixed in with
     the dev-loop instructions; a consumer should be able to stand
     up their own Worker without reading the contributor docs.

---

## v0.4 — Cleanup, polish, perf, codes

**Status:** shipped 2026-04-28. Edge-swipe was split out into v0.5
because it carries real device-testing risk; this release captured
the low-risk wins plus the short-pairing-codes refactor that landed
mid-cycle.

- [x] **Rip out `cmd: 'goto'`.** Done. Also removed the unused `args`
      field on cmd messages and `RevealApi.slide()` (only caller was
      the goto branch). Pure deletion across protocol, deck-plugin,
      worker, and phone-ui.
- [x] **Badge fade-and-flash transitions.** Done. Green flash on every
      entry into 'connected' (first pair + reconnects), 2.5s hold then
      600ms fade to invisible. Disconnect/reconnecting/failed states
      still stay sticky-visible.
- [x] **Haptic feedback** on `cmd` ack via `navigator.vibrate(10)`.
      Done. Buzzes only when the WS actually accepted the message;
      iOS Safari no-ops silently via optional chaining.
- [x] **Cache sanitized notes per slide.** Done. Keyed by the `<aside
      class="notes">` element rather than the slide itself — same
      WeakMap-drops-on-detach behavior, slightly tighter cache surface.
- [x] **Lazy-load the QR library.** Done. Split into
      `slide-remote-qr.js`, fetched via dynamic `<script>` when the
      pairing overlay opens. Main bundle 11.7 → 4.1 KB gzip.
- [x] **Idle DO cleanup.** Done. 24h alarm pushed forward on each
      event; on fire, wipes storage if no WS connections remain.
      `/api/room/new` rate-limiting deferred — wait for real-world
      mint-loop traffic, then a CF WAF rule.

---

## v0.5 — Swipe gesture, overlay polish, room persistence

**Status:** shipped 2026-04-29. Edge-swipe relaxed to a
direction-based swipe (no edge zone) after device testing showed
8 px insets fought iOS Safari's system back-swipe more than they
helped. Bundled with overlay keyboard trap, sessionStorage room
persistence with stale-token recovery, presenter-initiated room
regenerate, and a sanitizer pass for tables and external links.

- [x] **Direction-based swipe for next/prev** on the phone UI.
      Originally scoped as an edge-swipe (right-edge inward = next,
      left-edge inward = prev), the recognizer was widened to fire on
      any horizontal-dominant touch drag on the surface — the edge
      zone produced too many missed gestures and didn't actually buy
      coexistence with iOS Safari's left-edge back-swipe (system
      gesture, runs outside web events). Touch only; vertical-dominant
      movement (`|dy| > |dx|`) abandons so notes-pane scrolling still
      works. Body `touch-action: pan-y` gives JS clean ownership of
      every horizontal touch on the phone UI.
- [x] **Modal keyboard trap on the pairing overlay.** Reveal's
      arrow / N / P / B / O / space shortcuts no longer navigate the
      deck under the open QR; Esc still closes.
- [x] **Room persistence + regenerate.** Mint result cached in
      `sessionStorage` and re-used on deck reload (silent
      auto-resume — no QR flash); stale tokens recovered via
      close-before-open detection in `Client.openSocket`. Overlay
      gained a ↻ icon to revoke the current pairing and mint a fresh
      room without a deck reload.
- [x] **Sanitizer pass for speaker notes.** Added
      `table`/`thead`/`tbody`/`tfoot`/`tr`/`th`/`td`/`caption` to the
      allowlist; forces `target="_blank"` and `rel="noopener
      noreferrer"` on every `<a href>`.

---

## v0.6 — small followups

**Status:** unreleased. Catch-all for the next round of small UX
nudges. Pick items off as they earn their slot.

- [ ] **Version + GitHub link footer on the phone UI.** A tiny,
      muted `slide-remote vX.Y.Z` in the bottom-right of the page,
      linking to
      [github.com/adamaltmejd/quarto-slide-remote](https://github.com/adamaltmejd/quarto-slide-remote).
      Most visible on the landing screen (someone navigating to the
      bare Worker origin); also fine as a corner footer on `/r/{room}`
      since the layout already locks the body to `100dvh` and the notes
      pane is the only scrollable region — a `position: fixed` corner
      element won't fight content. Inject the version from the root
      `package.json` at phone-ui build time (e.g. via a Bun build
      `define` for `__SR_VERSION__`) so it stays in sync with releases
      automatically; no runtime fetch.

---

## Risks and known issues

Tracked here so we don't forget; not in any priority order. Items
resolved by shipped releases are dropped — see CHANGELOG for closeouts.

- **iOS Safari + Low Power Mode** drops WebSockets aggressively when the screen sleeps. The reconnect ceiling (`MAX_RECONNECT_ATTEMPTS = 60`) caps the spinner at ~15 minutes; wake lock + fast reconnect (both v0.2) help further, but the screen-off → screen-on cycle still needs explicit testing on a real device.
- **DO SQLite + `new_sqlite_classes` migrations are one-way.** Pin compat date carefully and version any migration changes.
- **`presenterToken` in URL hash** keeps it out of server logs but lands in browser history. Acceptable today.
- **`/api/room/new` CORS** is currently `*` and unrate-limited. CORS allowlisting is a non-starter (deck origins are user-hosted Quarto sites and unknown to the Worker). Idle DO cleanup (v0.4) bounds storage; add a CF WAF rate-limit rule only if real-world traffic shows mint-loop abuse.
- **`quarto add` resolves to a git tag**, not `main`. Release discipline matters; CI must create tags for every release. All releases through v0.3.1 followed this; future releases must too.
- **Course repo CI**: the consumer's `publish-course-material.yml` renders decks with the plugin loaded. Our own CI proves silence across 3 scenarios (decktape, missing worker-url, kill switch). Promote the consumer's check from manual to asserted when convenient.
- **Multi-presenter is unenforced**: two presenter connections to the same room means last-write-wins on snapshots. Documented in `packages/protocol/src/index.ts`; `RoomDO.webSocketMessage` would need a role check to enforce single-presenter. Low-impact in practice (one talk → one presenter token).
- **`Role` naming lags user-facing language**: the wire protocol still uses `viewer` for what user-facing copy now calls *remote* (since v0.4's laptop-as-remote support). Rename deferred to coincide with adding a separate read-only audience role, which would naturally take the `viewer` name. Flagged in the v0.4 changelog; do not silently rename without the audience-role landing.
