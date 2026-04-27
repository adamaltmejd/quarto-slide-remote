// Bundle-size budget. Builds the plugin minified, gzip-encodes it, and exits
// non-zero if the result exceeds BUDGET_GZIP_BYTES. Used in CI.
//
// Usage: bun scripts/size-check.ts

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP_BYTES = 30 * 1024;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outFile = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd: repoRoot, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} → ${code}`)),
    );
  });
}

await run('bun', ['run', 'build:plugin:min']);

const bytes = await Bun.file(outFile).bytes();
const raw = bytes.length;
const gz = gzipSync(bytes).length;
const ratio = ((gz / BUDGET_GZIP_BYTES) * 100).toFixed(1);

console.log(`[size-check] ${outFile}`);
console.log(`             raw   ${raw.toLocaleString()} B`);
console.log(
  `             gzip  ${gz.toLocaleString()} B  (${ratio}% of ${BUDGET_GZIP_BYTES} B budget)`,
);

if (gz > BUDGET_GZIP_BYTES) {
  console.error(`[size-check] FAIL: gzipped size ${gz} B exceeds budget ${BUDGET_GZIP_BYTES} B`);
  process.exit(1);
}
console.log('[size-check] OK');
