// Builds phone UI into packages/worker/assets/. Phase 0 stub: copies html/css and bundles main.ts.
//
// Usage:
//   bun packages/phone-ui/build.ts
//   bun packages/phone-ui/build.ts --watch

import { watch } from 'node:fs';
import { copyFile, cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, 'src');
const outDir = resolve(here, '..', 'worker', 'assets');

async function build(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [resolve(srcDir, 'main.ts')],
    outdir: outDir,
    target: 'browser',
    format: 'esm',
    minify: false,
  });
  if (!result.success) {
    console.error('[phone-ui] build failed');
    for (const log of result.logs) console.error(log);
    process.exitCode = 1;
    return;
  }

  await copyFile(resolve(srcDir, 'index.html'), resolve(outDir, 'index.html'));
  await copyFile(resolve(srcDir, 'style.css'), resolve(outDir, 'style.css'));
  await cp(resolve(srcDir, 'pwa'), resolve(outDir, 'pwa'), { recursive: true });

  console.log(`[phone-ui] built → ${outDir}`);
}

await build();

if (process.argv.includes('--watch')) {
  console.log(`[phone-ui] watching ${srcDir}`);
  const watcher = watch(srcDir, { recursive: true }, () => void build());
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
  await new Promise(() => {});
}
