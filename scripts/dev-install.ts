// dev-install: build the deck plugin and copy `_extensions/slide-remote/`
// into a consumer Quarto project's `_extensions/` directory.
//
// Set the destination via env var:
//   SLIDE_REMOTE_CONSUMER=/path/to/consumer-deck bun scripts/dev-install.ts
// Add --watch to rebuild and re-copy on source changes.
//
// The consumer should add `_extensions/slide-remote/` to its .gitignore while
// developing. At publish time, switch to `quarto add adamaltmejd/quarto-slide-remote`.

import { watch } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const sourceExt = resolve(repoRoot, '_extensions', 'slide-remote');
const pluginSrc = resolve(repoRoot, 'packages', 'deck-plugin', 'src');
const buildScript = resolve(repoRoot, 'packages', 'deck-plugin', 'build.ts');

const consumer = process.env.SLIDE_REMOTE_CONSUMER;
if (!consumer) {
  console.error('error: SLIDE_REMOTE_CONSUMER env var not set');
  console.error(
    '  example: SLIDE_REMOTE_CONSUMER=/path/to/datascience-course bun scripts/dev-install.ts',
  );
  process.exit(1);
}

const consumerExt = resolve(consumer, '_extensions', 'slide-remote');

async function buildPlugin(): Promise<boolean> {
  const proc = Bun.spawn(['bun', buildScript], {
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  return code === 0;
}

async function copyToConsumer(): Promise<void> {
  await rm(consumerExt, { recursive: true, force: true });
  await mkdir(dirname(consumerExt), { recursive: true });
  await cp(sourceExt, consumerExt, { recursive: true });
  console.log(`[dev-install] copied → ${consumerExt}`);
}

async function buildAndCopy(): Promise<void> {
  const ok = await buildPlugin();
  if (!ok) {
    console.error('[dev-install] build failed; not copying');
    return;
  }
  await copyToConsumer();
}

await buildAndCopy();

if (process.argv.includes('--watch')) {
  console.log(`[dev-install] watching ${pluginSrc} and ${sourceExt}`);
  let pending: ReturnType<typeof setTimeout> | null = null;
  const trigger = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      void buildAndCopy();
    }, 100);
  };
  const w1 = watch(pluginSrc, { recursive: true }, (_, f) => f && trigger());
  const w2 = watch(sourceExt, { recursive: true }, (_, f) => {
    // Skip the built output to avoid feedback loop.
    if (f === 'slide-remote.js') return;
    if (f) trigger();
  });
  process.on('SIGINT', () => {
    w1.close();
    w2.close();
    process.exit(0);
  });
  await new Promise(() => {});
}
