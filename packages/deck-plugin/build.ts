// Builds the deck plugin into _extensions/slide-remote/slide-remote.js as an IIFE.
//
// Usage:
//   bun packages/deck-plugin/build.ts            # readable dev build
//   bun packages/deck-plugin/build.ts --minify   # minified release build
//   bun packages/deck-plugin/build.ts --watch    # rebuild on source change

import { statSync, watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const entry = resolve(here, 'src', 'index.ts');
const outFile = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');

const minify = process.argv.includes('--minify');

async function build(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: dirname(outFile),
    naming: 'slide-remote.js',
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
  const raw = statSync(outFile).size;
  const gz = gzipSync(await Bun.file(outFile).bytes()).length;
  const tag = minify ? 'min' : 'dev';
  console.log(`[deck-plugin] built → ${outFile} (${tag}, ${raw} B / ${gz} B gzip)`);
}

await build();

if (process.argv.includes('--watch')) {
  console.log(`[deck-plugin] watching ${resolve(here, 'src')}`);
  const watcher = watch(resolve(here, 'src'), { recursive: true }, (_evt, file) => {
    if (file?.endsWith('.ts')) void build();
  });
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
  // Keep process alive
  await new Promise(() => {});
}
