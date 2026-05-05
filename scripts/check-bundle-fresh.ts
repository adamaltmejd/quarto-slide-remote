// Bundle-freshness check. Builds the deck plugin minified into a temp dir
// and asserts the committed _extensions/slide-remote/slide-remote.js matches
// byte-for-byte. Catches drift where a contributor edits packages/deck-plugin/src/
// and forgets to rebuild before committing — which would silently ship a
// stale bundle to `quarto add` consumers (the extension pulls bytes from the
// git tag, not main).
//
// Usage: bun scripts/check-bundle-fresh.ts

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const committed = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');

const tmpDir = mkdtempSync(resolve(tmpdir(), 'slide-remote-build-'));
const built = resolve(tmpDir, 'slide-remote.js');

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

await run('bun', ['run', 'build:plugin:min'], { SLIDE_REMOTE_PLUGIN_OUT: built });

const a = readFileSync(built);
const b = readFileSync(committed);
if (a.length === b.length && a.equals(b)) {
  console.log(`[bundle-fresh] OK slide-remote.js (${a.length} B)`);
} else {
  console.error(
    `[bundle-fresh] DRIFT slide-remote.js: committed ${b.length} B, fresh build ${a.length} B`,
  );
  console.error('');
  console.error('[bundle-fresh] FAIL: committed bundle does not match a fresh build.');
  console.error('  Run:    bun run build:plugin:min');
  console.error('  Commit: _extensions/slide-remote/slide-remote.js');
  process.exit(1);
}
