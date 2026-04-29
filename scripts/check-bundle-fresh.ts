// Bundle-freshness check. Builds the deck plugin minified into a temp dir
// and asserts the committed _extensions/slide-remote/{slide-remote,slide-remote-qr}.js
// match byte-for-byte. Catches drift where a contributor edits
// packages/deck-plugin/src/ and forgets to rebuild before committing —
// which would silently ship a stale bundle to `quarto add` consumers
// (the extension pulls bytes from the git tag, not main).
//
// Usage: bun scripts/check-bundle-fresh.ts

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QR_CHUNK_FILENAME } from '../packages/deck-plugin/src/qr-chunk-name';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const committedDir = resolve(repoRoot, '_extensions', 'slide-remote');

const tmpDir = mkdtempSync(resolve(tmpdir(), 'slide-remote-build-'));
const tmpMain = resolve(tmpDir, 'slide-remote.js');

function run(cmd: string, args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.on('exit', (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} → ${code}`)),
    );
  });
}

await run('bun', ['run', 'build:plugin:min'], { SLIDE_REMOTE_PLUGIN_OUT: tmpMain });

const targets = [
  {
    name: 'slide-remote.js',
    built: tmpMain,
    committed: resolve(committedDir, 'slide-remote.js'),
  },
  {
    name: QR_CHUNK_FILENAME,
    built: resolve(tmpDir, QR_CHUNK_FILENAME),
    committed: resolve(committedDir, QR_CHUNK_FILENAME),
  },
];

let drift = false;
for (const { name, built, committed } of targets) {
  const a = readFileSync(built);
  const b = readFileSync(committed);
  if (a.length === b.length && a.equals(b)) {
    console.log(`[bundle-fresh] OK    ${name} (${a.length} B)`);
  } else {
    drift = true;
    console.error(
      `[bundle-fresh] DRIFT ${name}: committed ${b.length} B, fresh build ${a.length} B`,
    );
  }
}

if (drift) {
  console.error('');
  console.error('[bundle-fresh] FAIL: committed bundle does not match a fresh build.');
  console.error('  Run:    bun run build:plugin:min');
  console.error('  Commit: _extensions/slide-remote/slide-remote.js');
  console.error('          _extensions/slide-remote/slide-remote-qr.js');
  process.exit(1);
}
console.log('[bundle-fresh] OK');
