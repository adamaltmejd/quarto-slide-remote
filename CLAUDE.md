# CLAUDE.md

`quarto-slide-remote` is an iPhone remote + speaker-notes companion for static reveal.js decks. The deck-side integration ships as a Quarto extension (`quarto add`) and talks to a small Cloudflare Worker over WebSockets. No software install on the venue PC beyond opening the deck URL.

User-facing setup, configuration, and troubleshooting live in `README.md`. Roadmap in `ROADMAP.md`, release history in `CHANGELOG.md`.

## Toolchain

- **Runtime / scripts:** `bun` (not node/npm). Workspaces under `packages/*`.
- **Lint/format:** `biome` (`bun run lint`, `bun run format`). Config at `biome.json`.
- **Typecheck:** `tsc --noEmit` per workspace (`bun run typecheck`). Strict mode + `noUncheckedIndexedAccess`.
- **Tests:** `bun test`. Browser-API tests use happy-dom, registered globally via `test-setup.ts` (preloaded via `bunfig.toml`).
- **Worker dev/deploy:** `wrangler` via `bunx`.
- Pre-commit hook in `.githooks/pre-commit` runs lint + typecheck + tests. Enable once per clone with `bun run hooks:install`.
- **Commits:** lowercase scope prefix + imperative summary, e.g. `deck-plugin: rebuild bundle for keyboard trap`. Scopes match package/dir names (`deck-plugin`, `phone-ui`, `worker`, `ci`, `roadmap`, `release`). CHANGELOG entries land under `[Unreleased]` until a release promotes them.

## Common commands

```bash
bun run demo          # one-shot end-to-end: builds plugin + phone UI, boots
                      # `wrangler dev`, serves the fixture deck at :5174, opens
                      # the browser. `-- --no-open` and `-- --no-watch` available.
bun run dev:worker    # wrangler dev only (Worker on :8787, no demo deck)
SLIDE_REMOTE_CONSUMER=/path/to/deck-repo bun run dev:install  # build + copy
                      # `_extensions/slide-remote/` into a real consumer deck
                      # (add `--watch` for live rebuild)

bun test                                       # all unit tests
bun test packages/deck-plugin/src/extract.test.ts   # single file
bun test --test-name-pattern "sanitize"        # filter by test name
bun run test:smoke    # integration: boots wrangler dev, exercises WS protocol
                      # (sets SR_INTEGRATION=1; integration test is skipped
                      # otherwise). Set SR_BASE=http://host:port to target an
                      # already-running instance instead of spawning wrangler.

bun run build:plugin:min   # minified deck plugin → _extensions/slide-remote/
bun run build:phone        # phone UI → packages/worker/assets/
bun run size               # 30 KB gzip budget on the deck plugin (CI gate)
bun run check:bundle       # asserts committed _extensions/slide-remote/*.js
                           # matches a fresh `build:plugin:min` (CI gate)
bun run deploy             # build:plugin:min + build:phone, then `wrangler deploy`
```

CI (`.github/workflows/ci.yml`) runs four jobs on every push and PR: `unit` (lint → typecheck → unit tests → builds → size budget), `integration` (smoke test), `decktape-silent` (asserts the plugin is fully silent in three bail-out scenarios), and `bundle-fresh` (the `check:bundle` gate above).

## Architecture

Four workspaces under `packages/` plus the Quarto extension under `_extensions/slide-remote/`:

| Package                  | Role                                                                            |
| ------------------------ | ------------------------------------------------------------------------------- |
| `packages/protocol/`     | TS types shared across all three runtimes — wire schema, pair-code constants    |
| `packages/deck-plugin/`  | Reveal.js plugin that runs in the deck's browser tab (TS → IIFE bundle)         |
| `packages/phone-ui/`     | Static SPA served by the Worker — the phone-side controller UI                  |
| `packages/worker/`       | Cloudflare Worker + Durable Object — REST mint endpoint and WebSocket relay     |
| `_extensions/slide-remote/` | What `quarto add` installs into a consumer deck                              |

### How a session flows

1. Deck loads `_extensions/slide-remote/slide-remote.js` (built from `packages/deck-plugin/src/`). `filter.lua` reads `slide-remote:` YAML keys and emits `<meta>` tags the plugin reads at init time.
2. Presenter triggers activation (`?remote=1`, Shift+R, or opt-in corner button). Plugin POSTs `/api/room/new` to the Worker.
3. Worker mints a 4-char Crockford-32 `roomId` + presenter token, instantiates a `RoomDO` Durable Object keyed by roomId, returns a join URL with the token in the URL hash.
4. Plugin opens a presenter WebSocket to `/api/ws` (proxied to the DO), shows the QR overlay, and starts pumping `SlideState` on Reveal events.
5. Phone scans the QR → loads the phone-ui SPA from the same Worker origin → opens a viewer WebSocket. The DO replays the last snapshot from storage to late viewers and forwards subsequent state pushes.
6. Phone commands (`next`/`prev`/`black`/`resetTimer`) go viewer→DO→presenter and are applied via Reveal's public API.

### Key invariants the code relies on

- **The committed deck-plugin bundle in `_extensions/slide-remote/{slide-remote,slide-remote-qr}.js` is the source of truth for `quarto add` consumers** — the extension is fetched by git tag, not from `main`. Any source change in `packages/deck-plugin/src/` MUST be followed by `bun run build:plugin:min` and a commit of the regenerated bundles. The `bundle-fresh` CI job enforces this. (`scripts/check-bundle-fresh.ts`)
- **The deck plugin must stay silent when not activated.** Three bail-out paths (no `worker-url`, `<meta name="slide-remote-enabled" content="false">`, `?print-pdf` / `disable-on-params` / `navigator.webdriver`) all exit `init()` before constructing any WebSocket, attaching listeners, or appending DOM. `scripts/check-decktape-silent.ts` runs this assertion in CI.
- **Theme/Reveal-API independence.** Use only Reveal's public JS API and the standard `<aside class="notes">` / `<section>` DOM contract; CSS is `.sr-*` scoped to avoid theme collisions.
- **30 KB gzip budget on the main plugin bundle.** The QR library lives in a lazy `slide-remote-qr.js` chunk fetched only when the overlay opens (so the 99% non-paired case doesn't pay its parse cost).
- **Trust model:** one shared room secret authenticates both presenter and viewer (carried in URL hash so it never hits server logs). The Worker does NOT enforce single-presenter — two clients with the same token can both publish state, last write wins. This is intentional for v0.x.
- **Room mint is a retry loop.** 4-char Crockford-32 IDs (~1M keyspace) collide rarely but possibly; `RoomDO.fetch('/init')` returns 409 on re-init and the Worker retries up to 10× before 503. Don't change `/init`'s 409 semantics without updating the mint loop.
- **DO idle TTL is 24 h with debounced alarm bumps.** `RoomDO` writes the alarm at most once per 5 min to avoid amplifying every WS message into a storage write.

## Release workflow

Three files carry the version, and a release bumps all three plus moves the CHANGELOG `[Unreleased]` block under a new versioned heading:

- `package.json` → `version`
- `_extensions/slide-remote/_extension.yml` → `version`
- `CHANGELOG.md` → promote `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`

Then: rebuild + commit the bundle (`bun run build:plugin:min`), tag the commit `vX.Y.Z`, push the tag — `quarto add` consumers fetch by tag.

## Gotchas worth knowing

- The phone is served from the Worker origin (`/r/:roomId` falls through to `env.ASSETS`), so a single deploy hosts both the API and the phone UI.
- `packages/worker/assets/` is the phone-ui build output (`.gitkeep` only is tracked); `wrangler.toml` requires the directory to exist.
- `bun run demo` builds the deck plugin into `demo/.cache/` (gitignored) via `SLIDE_REMOTE_PLUGIN_OUT` so the watch loop never dirties the committed minified bundle in `_extensions/`.
- `extract.ts` caches sanitized notes per `<aside.notes>` element via WeakMap; assumes notes DOM is static post-render. In-place `innerHTML` mutation will not invalidate the cache.
- `client.ts` uses a `generation` counter on every `openSocket()` / `regenerate()`; in-flight WS handlers capture it at create time and bail if it no longer matches. Don't drop this when refactoring reconnect logic — it prevents stale handlers from racing with regenerate().
- `room-storage.ts` keeps the room in `sessionStorage` so a deck reload doesn't break the pair. If the stored room is stale (DO evicted), `client.ts` detects close-before-open and re-mints.
