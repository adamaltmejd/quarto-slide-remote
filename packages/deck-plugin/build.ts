// Builds the deck plugin as a single IIFE bundle (slide-remote.js) loaded by
// Quarto's _extension.yml. The QR library is bundled inline — at ~12 KB gzip
// total it's well under the 30 KB budget, and shipping a single file removes
// a class of "missing sibling chunk" deployment bugs.
//
// Usage:
//   bun packages/deck-plugin/build.ts            # readable dev build
//   bun packages/deck-plugin/build.ts --minify   # minified release build
//   bun packages/deck-plugin/build.ts --watch    # rebuild on source change
//
// Override the output path with SLIDE_REMOTE_PLUGIN_OUT=/abs/path/to.js.
// Used by `scripts/demo.ts` to write into demo/.cache/ so a watch rebuild
// never dirties the committed minified bundle in `_extensions/`.

import { watch } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const srcDir = resolve(here, 'src');
const defaultOut = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');
const mainOut = process.env.SLIDE_REMOTE_PLUGIN_OUT
  ? resolve(process.env.SLIDE_REMOTE_PLUGIN_OUT)
  : defaultOut;
const outDir = dirname(mainOut);
const mainBasename = basename(mainOut);

const minify = process.argv.includes('--minify');

async function build(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [resolve(srcDir, 'index.ts')],
    outdir: outDir,
    naming: mainBasename,
    target: 'browser',
    format: 'iife',
    minify,
    sourcemap: 'none',
  });
  if (!result.success) {
    console.error('[deck-plugin] build failed');
    for (const log of result.logs) console.error(log);
    process.exitCode = 1;
    return;
  }
  const outPath = resolve(outDir, mainBasename);
  const raw = (await stat(outPath)).size;
  const gz = gzipSync(await Bun.file(outPath).bytes()).length;
  const tag = minify ? 'min' : 'dev';
  console.log(`[deck-plugin] built → ${outPath} (${tag}, ${raw} B / ${gz} B gzip)`);
}

await build();

if (process.argv.includes('--watch')) {
  console.log(`[deck-plugin] watching ${srcDir}`);
  const watcher = watch(srcDir, { recursive: true }, (_evt, file) => {
    if (file?.endsWith('.ts')) void build();
  });
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
  // Keep process alive
  await new Promise(() => {});
}
