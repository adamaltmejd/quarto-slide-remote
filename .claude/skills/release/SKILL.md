---
name: release
description: Cut a quarto-slide-remote release from `main`. Verifies CHANGELOG/ROADMAP, bumps every version field in lockstep, runs the full local CI gate, builds artifacts, commits `release: vX.Y.Z`, tags, pushes, conditionally deploys the Worker if Worker/phone-ui/protocol changed, then creates a GitHub release with the new CHANGELOG section as body. Trigger on `/release`, `/release patch|minor|major`, or `/release X.Y.Z`.
---

# /release — cut a tagged release

The Quarto extension is fetched **by git tag**; the Worker at
`slide-remote.adamaltmejd.workers.dev` is a separate hosted artefact.
This skill ships both halves: tag → `quarto add` consumers; conditional
`wrangler deploy` → Worker + phone-ui assets.

## Typical entry path

User merged a PR via `gh pr merge`; local `main` is behind `origin/main`
with CHANGELOG entries already under `[Unreleased]`. They run `/release`.
Fetch and fast-forward — don't refuse.

## Inputs

- `X.Y.Z` — exact version, must be strictly greater than current
- `patch` / `minor` / `major` — bump from current
- (none) — infer from `[Unreleased]`: any `### Added` / `### Changed` →
  **minor**; only `### Fixed` / `### Removed` / docs / tooling →
  **patch**; ambiguous → ask via `AskUserQuestion`

Current version is `package.json#version`; the other five fields are
kept in lockstep.

## Phase 1 — Preconditions

| Check | Action |
| --- | --- |
| On `main` | `git rev-parse --abbrev-ref HEAD` ≡ `main`. Else stop. |
| Sync with origin | `git fetch origin main`. Behind → `git merge --ff-only`. Ahead/diverged → stop. |
| Release files clean | No uncommitted changes to version files, CHANGELOG, ROADMAP, `_extensions/`. Stray files elsewhere don't block. |
| `[Unreleased]` non-empty | At least one bullet between `## [Unreleased]` and the next `## [`. Empty → merged PR forgot CHANGELOG; stop. |
| `gh auth status` succeeds | Phase 8 needs it. |
| `bunx wrangler whoami` succeeds | Phase 7 may need it. Informational on deck-plugin-only releases. |
| Bundle is fresh | `bun run check:bundle`. Stale → `bun run build:plugin:min`, stage the regenerated `_extensions/slide-remote/{slide-remote,slide-remote-qr}.js`. |
| Bundle within budget | `bun run size`. Over the 30 KB gzip cap → stop; that's a real bug, not a release-time fix. |

## Phase 2 — Verify CHANGELOG/ROADMAP coherence

User asked for verification, not just edits.

- **CHANGELOG:** spot-check 2-3 `[Unreleased]` bullets against
  `git log --since=<last release date> --oneline` and the touched files.
  Bullet describes work not present → stop and ask. Empty subsection
  headings → drop them.
- **ROADMAP:** the matching `## v{X.Y} — …` section's `### Status` should
  read pending, not "Shipped". Checklist items whose substance matches
  CHANGELOG bullets are candidates to flip to `[x]` — don't invent
  matches.

Structurally wrong file (missing version section, mismatched heading) →
stop, surface the issue.

## Phase 3 — File edits

### Six version fields (lockstep)

| File                                       | Edit                                |
| ------------------------------------------ | ----------------------------------- |
| `package.json`                             | `"version": "X.Y.Z"`                |
| `_extensions/slide-remote/_extension.yml`  | `version: X.Y.Z` (YAML, no quotes)  |
| `packages/protocol/package.json`           | `"version": "X.Y.Z"`                |
| `packages/deck-plugin/package.json`        | `"version": "X.Y.Z"`                |
| `packages/phone-ui/package.json`           | `"version": "X.Y.Z"`                |
| `packages/worker/package.json`             | `"version": "X.Y.Z"`                |

`_extensions/_extension.yml` is the version `quarto add` consumers read.

Sanity-check after editing:
`git diff -- '*.json' '*/_extension.yml' | rg '"version"|^version:'` —
should show six matching `+` lines.

### CHANGELOG.md

1. Insert dated heading **under** `## [Unreleased]` (don't replace it):

   ```diff
    ## [Unreleased]

   +## [X.Y.Z] - YYYY-MM-DD
   +
    ### Added — phone UI
   ```

   Date: `date -u +%Y-%m-%d` (ISO, not locale).

2. Bottom link refs (currently stale: only v0.2.0 / v0.1.x are linked):
   - Update `[Unreleased]: …compare/vX.Y.Z...HEAD`
   - Insert `[X.Y.Z]: …compare/v{prev}...vX.Y.Z` above the previous link.
   - Don't backfill missing intermediate-version links — noise in a
     release commit.

### ROADMAP.md

**Minor / major:**
- Top banner → `**Status:** vX.Y.Z shipped YYYY-MM-DD at …`
- `## v{X.Y} — …` section's `### Status` body →
  `**Shipped YYYY-MM-DD as vX.Y.Z.**` + 1-line summary from highlights
- Flip `[ ]` → `[x]` for items verified in Phase 2
- **Do not** open `v{X.Y+1}` here — separate follow-up commit, see
  `fb4bfc3 roadmap: open v0.6 …`

**Patch:** just bump the top banner.

## Phase 4 — Build artifacts

```bash
bun run build:plugin:min  # _extensions/slide-remote/*.js  (tracked)
bun run build:phone       # packages/worker/assets/        (gitignored)
```

Stage any `_extensions/*.js` changes. `build:phone` output is consumed
by Phase 7's `wrangler deploy` (when it runs).

## Phase 5 — Commit

Stage explicitly — never `git add -A`:

```bash
git add package.json \
  _extensions/slide-remote/_extension.yml \
  _extensions/slide-remote/slide-remote.js \
  _extensions/slide-remote/slide-remote-qr.js \
  packages/protocol/package.json \
  packages/deck-plugin/package.json \
  packages/phone-ui/package.json \
  packages/worker/package.json \
  CHANGELOG.md ROADMAP.md
```

Message style (`git log --grep '^release:'` for examples):

```
release: vX.Y.Z

<one-paragraph summary>. See CHANGELOG. Highlights: <2-4 specific items
in prose, no bullets>.
```

Pre-commit hook (`.githooks/pre-commit`) runs lint/typecheck/tests —
that's the gate. Hook failure → fix and commit again. **Don't `--amend`**:
a failed pre-commit means no commit happened, so `--amend` rewrites the
*previous* unrelated commit.

## Phase 6 — Tag and push

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"   # annotated; signs if tag.gpgsign=true
git push origin main
git push origin vX.Y.Z
```

`-a` makes it an annotated tag (lightweight tags can't be signed at all).
Signing is left to the user's git config (`tag.gpgsign` + `user.signingkey`)
— deliberately not forced with `-s`, so a fork without signing keys
doesn't error out. Past tags in the repo are annotated-but-unsigned;
going forward they'll be signed for users with `tag.gpgsign=true`.

User opted into autonomous push. On failure: stop, surface error, no
destructive retry.

## Phase 7 — Conditional Worker deploy

```bash
PREV=$(git describe --tags --abbrev=0 HEAD^)
git diff --name-only "$PREV..vX.Y.Z" -- \
  packages/worker packages/phone-ui packages/protocol
```

- **Empty** → log `Worker deploy: skipped (deck-plugin-only)`, continue.
- **Non-empty** → `bun run deploy` (rebuilds + `wrangler deploy` against
  `slide-remote.adamaltmejd.workers.dev`).

Production action, immediately live, no rollback. On failure: stop,
surface wrangler error verbatim, **no auto-retry** (auth/quota/config
errors loop on retry). Tag is already pushed, so consumers see the new
deck-plugin against the previous Worker until the user reruns
`bun run deploy` manually.

## Phase 8 — GitHub release

Read the new section from CHANGELOG (between the new heading and the
next `## [`, drop the heading line itself), pipe to `gh` via heredoc:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file - <<'EOF'
<the section body, exactly as written in CHANGELOG>
EOF
```

No `--draft` (autonomous publish). On failure (usually tag-replication
lag from Phase 6's push): wait 2-3 s, retry once, then stop.

## Phase 9 — Final report

```
release vX.Y.Z complete
- commit:     <sha>
- tag:        https://github.com/adamaltmejd/quarto-slide-remote/releases/tag/vX.Y.Z
- worker:     deployed | skipped (deck-plugin-only)
- gh release: <same URL as tag>
```

Follow-ups (don't perform):
1. Open next minor's roadmap section (`## v{X.Y+1} — …`); see `fb4bfc3`.
2. Watch tag CI: `gh run watch` or `gh run list --branch vX.Y.Z`.

## Recovery

- **Tag already exists** (`git tag` fails): prior run died mid-flow. Ask
  before `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` —
  destructive if anyone fetched it.
- **GitHub release already exists**: same shape,
  `gh release delete vX.Y.Z --yes`.
- **Empty `[Unreleased]`**: PR forgot CHANGELOG. Fix in a follow-up
  commit on `main` — not in the release commit (hides which work
  belongs to which PR).
