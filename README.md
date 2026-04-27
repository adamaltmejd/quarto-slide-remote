# quarto-slide-remote

iPhone remote control + speaker-notes companion for static reveal.js decks.

A small Cloudflare Worker brokers WebSocket messages between a reveal.js deck and the presenter's phone. The deck-side integration ships as a Quarto extension that any reveal.js deck can install with `quarto add`. No software install on the venue PC beyond opening a URL.

## Status

Phase 0 — scaffold. Plugin loads silently; no socket, no UI. Activation logic, Worker, and phone UI land in subsequent phases.

## Architecture

| Piece | Path | What it is |
|---|---|---|
| Quarto extension | `_extensions/slide-remote/` | What `quarto add` installs into a consumer deck |
| Deck plugin source | `packages/deck-plugin/` | TS source of the bundled `slide-remote.js` |
| Phone UI source | `packages/phone-ui/` | Static HTML/TS served by the Worker |
| Worker + Durable Object | `packages/worker/` | Cloudflare Worker; one deploy per presenter |
| Shared protocol types | `packages/protocol/` | TS types shared across deck, phone, and worker |

## Install (consumer deck)

```bash
quarto add adamaltmejd/quarto-slide-remote
```

Then in the deck's YAML:
```yaml
format:
  revealjs:
    revealjs-plugins:
      - slide-remote
slide-remote:
  worker-url: https://slide-remote.adamaltmejd.workers.dev
  show-button: false
  disable-on-params: [handout]
```

The plugin is silent for student viewers. Activate during a talk by:
- appending `?remote=1` to the deck URL, or
- pressing **Shift+R** with the deck focused, or
- clicking the corner button if `show-button: true` is set.

## Develop

```bash
bun install
SLIDE_REMOTE_CONSUMER=/path/to/consumer-deck bun run dev:install
# in the consumer deck:
quarto preview path/to/lecture.qmd
```

`dev:install` builds the plugin and copies `_extensions/slide-remote/` into the consumer's `_extensions/slide-remote/` on every change.

For Worker development:
```bash
bun run dev:worker
```

## Theme-independence

The plugin makes no assumptions about the deck's theme. It uses only Reveal's public JS API and the standard DOM contract (`<aside class="notes">`, `<section>` slides). CSS is self-scoped under `.sr-*`.
