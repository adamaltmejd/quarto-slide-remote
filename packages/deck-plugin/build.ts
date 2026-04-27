// Builds the deck plugin into _extensions/slide-remote/slide-remote.js as an IIFE.
//
// Usage:
//   bun packages/deck-plugin/build.ts            # one-shot build
//   bun packages/deck-plugin/build.ts --watch    # rebuild on source change

import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const entry = resolve(here, 'src', 'index.ts');
const outFile = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');

async function build(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: dirname(outFile),
    naming: 'slide-remote.js',
    target: 'browser',
    format: 'iife',
    minify: false,
    sourcemap: 'none',
  });
  if (!result.success) {
    console.error('[deck-plugin] build failed');
    for (const log of result.logs) console.error(log);
    process.exitCode = 1;
    return;
  }
  console.log(`[deck-plugin] built → ${outFile}`);
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
