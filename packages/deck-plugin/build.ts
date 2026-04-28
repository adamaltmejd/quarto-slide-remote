// Builds the deck plugin as two IIFE bundles:
//   - slide-remote.js     — main plugin, loaded by Quarto's _extension.yml
//   - slide-remote-qr.js  — lazy chunk holding qrcode-generator (~50 KB raw),
//                            fetched via <script> only when the pairing
//                            overlay opens, so the 99% non-paired case
//                            doesn't pay the QR library's parse cost.
//
// Usage:
//   bun packages/deck-plugin/build.ts            # readable dev build
//   bun packages/deck-plugin/build.ts --minify   # minified release build
//   bun packages/deck-plugin/build.ts --watch    # rebuild on source change
//
// Override the output directory with SLIDE_REMOTE_PLUGIN_OUT=/abs/path/to.js.
// Both bundles land next to each other regardless. Used by `scripts/demo.ts`
// to write into demo/.cache/ so a watch rebuild never dirties the committed
// minified bundle in `_extensions/`.

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
const qrBasename = mainBasename.replace(/\.js$/, '-qr.js');

const minify = process.argv.includes('--minify');

async function buildOne(entry: string, outBasename: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: outDir,
    naming: outBasename,
    target: 'browser',
    format: 'iife',
    minify,
    sourcemap: 'none',
  });
  if (!result.success) {
    console.error(`[deck-plugin] build failed for ${outBasename}`);
    for (const log of result.logs) console.error(log);
    process.exitCode = 1;
    return;
  }
  const outPath = resolve(outDir, outBasename);
  const raw = (await stat(outPath)).size;
  const gz = gzipSync(await Bun.file(outPath).bytes()).length;
  const tag = minify ? 'min' : 'dev';
  console.log(`[deck-plugin] built → ${outPath} (${tag}, ${raw} B / ${gz} B gzip)`);
}

async function build(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    buildOne(resolve(srcDir, 'index.ts'), mainBasename),
    buildOne(resolve(srcDir, 'qr-chunk.ts'), qrBasename),
  ]);
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
