# quarto-slide-remote

iPhone remote control + speaker-notes companion for static reveal.js decks.

A small Cloudflare Worker brokers WebSocket messages between a reveal.js deck
and the presenter's phone. The deck-side integration ships as a Quarto
extension that any reveal.js deck can install with `quarto add`. No software
install on the venue PC beyond opening the deck URL.

[![CI](https://github.com/adamaltmejd/quarto-slide-remote/actions/workflows/ci.yml/badge.svg)](https://github.com/adamaltmejd/quarto-slide-remote/actions/workflows/ci.yml)

## How it works

1. Open the deck on the venue PC.
2. Press **Shift+R** (or load with `?remote=1`). A QR code overlay appears.
3. Scan with your phone. The phone joins the room over a WebSocket.
4. Drive the deck from the phone — prev / next, with current and next slide
   titles plus speaker notes.

The token that authenticates both sides lives in the URL hash on the phone, so
it never reaches server logs. The Worker is internet-hosted and works over any
network, including the venue Wi-Fi the laptop is on.

## Install (consumer deck)

```bash
quarto add adamaltmejd/quarto-slide-remote
```

In the deck's YAML:

```yaml
format:
  revealjs:
    revealjs-plugins:
      - slide-remote
    filters:
      - slide-remote
slide-remote:
  worker-url: https://slide-remote.adamaltmejd.workers.dev
  show-button: false
  disable-on-params: [handout]
```

The plugin is silent for student viewers. Activation triggers (presenter only):

- append `?remote=1` to the deck URL,
- press **Shift+R** with the deck focused, or
- click the corner button if `show-button: true` is set.

## Configuration

All keys live under `slide-remote:`. Only `worker-url` is required.

| Key                  | Type     | Default | Purpose                                                                                                                   |
| -------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `worker-url`         | string   | —       | Where the Worker is deployed. Without it the plugin stays silent (no socket, no UI).                                      |
| `show-button`        | bool     | `false` | Render an unobtrusive 📱 button in the bottom-right corner that opens the pairing overlay.                                |
| `disable-on-params`  | string[] | `[]`    | URL params that disable the plugin entirely. Add the params your handout/PDF render uses (e.g. `[handout]` for decktape). |

The plugin also bails out automatically when:

- the URL contains `?print-pdf` (Reveal's standard print mode),
- `<meta name="slide-remote-enabled" content="false">` is present, or
- `navigator.webdriver` is true (any headless renderer including decktape).

## Theme independence

The plugin makes no assumptions about the deck's theme. It depends only on
Reveal's public JS API and the standard DOM contract (`<aside class="notes">`,
`<section>` slides). Its CSS is self-scoped under `.sr-*` so it cannot
collide with theme styles. Bring any reveal.js theme.

## Worker (one deploy per presenter)

The Worker hosts both the WebSocket API and the static phone UI from a single
origin.

```bash
git clone https://github.com/adamaltmejd/quarto-slide-remote
cd quarto-slide-remote
bun install
bun run dev:worker     # local: http://127.0.0.1:8787
# or
bun run deploy         # cloudflare: builds the plugin minified + phone UI, then `wrangler deploy`
```

After `wrangler deploy`, set the resulting `*.workers.dev` URL as `worker-url`
in your deck.

## Develop

```bash
bun install

# Build/watch the plugin and copy it into a consumer deck on every change.
SLIDE_REMOTE_CONSUMER=/path/to/your-deck-repo bun run dev:install

# In the consumer:
quarto preview path/to/lecture.qmd   # then append ?remote=1 to the URL
```

In a separate terminal, run a local Worker instance:

```bash
bun run dev:worker
```

`dev:install` overwrites the consumer's `_extensions/slide-remote/` as you
edit. Add that path to the consumer repo's `.gitignore` while iterating;
remove it once you `quarto add` the published extension.

### Quality gates

```bash
bun run lint         # biome
bun run typecheck    # tsc --noEmit, all workspaces
bun test             # 40 unit tests across sanitize, extract, protocol
bun run test:smoke   # integration: boots `wrangler dev`, exercises the WS protocol
bun run size         # bundle-size budget (30 KB gzip)
bun run hooks:install   # one-time: enable the tracked pre-commit hook
```

CI runs lint → typecheck → unit tests → build → size budget → integration →
decktape-silent on every push and PR. See `.github/workflows/ci.yml`.

## Road-test (real iPhone, public Worker)

1. `bun run deploy` — builds minified + deploys to Cloudflare.
2. In the consumer deck YAML, set `worker-url:` to the deployed URL.
3. `quarto preview` the deck on your laptop.
4. Append `?remote=1` to the preview URL — the QR overlay appears.
5. Scan with the iPhone over any network. The phone shows the current slide
   title, next-slide title, notes, and big prev/next buttons.

## Troubleshooting

- **Phone won't connect**: open the phone URL in Safari directly and check
  the connection dot. Most failures are CORS (mismatched `worker-url`) or a
  firewalled WebSocket. Confirm `wrangler tail` shows the upgrade.
- **Notes contain the deck's CSS**: the sanitizer drops `<style>` blocks; if
  you see CSS, your bundled `slide-remote.js` predates the fix — pull the
  latest tag and re-`quarto update`.
- **iOS drops the connection while idle**: iOS Safari + Low Power Mode kills
  WebSockets aggressively. The phone reconnects on screen-on; a wake-lock
  helper is on the v0.2 roadmap.
- **`?handout=true` renders aren't silent**: confirm `disable-on-params:
  [handout]` is in your YAML. Decktape sets `navigator.webdriver` so the
  plugin would bail out anyway, but the explicit param keeps the render
  clean even outside decktape.

## Project layout

| Piece                       | Path                          | What it is                                                       |
| --------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| Quarto extension            | `_extensions/slide-remote/`   | What `quarto add` installs into a consumer deck                  |
| Deck plugin source          | `packages/deck-plugin/`       | TS source of the bundled `slide-remote.js`                       |
| Phone UI source             | `packages/phone-ui/`          | Static HTML/TS served by the Worker                              |
| Worker + Durable Object     | `packages/worker/`            | Cloudflare Worker; one deploy per presenter                      |
| Shared protocol types       | `packages/protocol/`          | TS types shared across deck, phone, and worker                   |

## License

[MIT](LICENSE) — see `LICENSE`. Roadmap in `ROADMAP.md`, release history in
`CHANGELOG.md`.
