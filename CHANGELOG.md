# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/adamaltmejd/quarto-slide-remote/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/adamaltmejd/quarto-slide-remote/releases/tag/v0.1.0
