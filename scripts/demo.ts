// Local demo: builds the plugin + phone UI, boots `wrangler dev` for the
// Worker, serves a fixture reveal.js deck, and opens it in the default
// browser. Lets you exercise the product end-to-end without a separate
// consumer slides repo.
//
// Usage:
//   bun run demo                # builds, watches, serves, opens browser
//   bun run demo -- --no-open   # don't auto-open the browser
//   bun run demo -- --no-watch  # build once and exit watch mode
//
// The deck-plugin watch builds into demo/.cache/ (gitignored) instead of the
// canonical `_extensions/slide-remote/`, so a long-running `bun run demo`
// session never clobbers the committed minified bundle.

import { mkdir, stat } from 'node:fs/promises';
import { networkInterfaces, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const demoDir = resolve(repoRoot, 'demo');
const cacheDir = resolve(demoDir, '.cache');
const pluginBundle = resolve(cacheDir, 'slide-remote.js');
const phoneUiAsset = resolve(repoRoot, 'packages', 'worker', 'assets', 'main.js');
// CSS is checked in (no build step), so we serve it directly.
const pluginCss = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.css');

const noOpen = process.argv.includes('--no-open');
const noWatch = process.argv.includes('--no-watch');

const DECK_PORT = 5174;
const WORKER_PORT = 8787;

function lanIp(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

async function buildOnce(
  label: string,
  args: string[],
  env?: Record<string, string>,
): Promise<void> {
  const proc = Bun.spawn(['bun', ...args], {
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`[demo] ${label} build failed (exit ${code})`);
}

function spawnWatch(
  label: string,
  args: string[],
  env?: Record<string, string>,
): ReturnType<typeof Bun.spawn> {
  const proc = Bun.spawn(['bun', ...args], {
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });
  void proc.exited.then((code) => {
    if (code !== 0) console.error(`[demo] ${label} watch exited ${code}`);
  });
  return proc;
}

// Polls `path` until its mtime is newer than `since`. Required because a stale
// bundle from a prior `bun run demo` would otherwise satisfy a plain existence
// check before the watcher's initial rebuild lands.
async function waitForFreshFile(path: string, since: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const s = await stat(path);
      if (s.mtimeMs > since) return;
    } catch {
      // doesn't exist yet
    }
    await Bun.sleep(100);
  }
  throw new Error(`[demo] ${path} did not refresh within ${timeoutMs}ms`);
}

async function assertPortFree(port: number): Promise<void> {
  // If something already responds on the port, fail fast with an actionable
  // error instead of letting the new wrangler crash silently and hanging in
  // waitForWorker for 30s.
  try {
    const ctl = AbortController ? new AbortController() : undefined;
    const timer = ctl ? setTimeout(() => ctl.abort(), 500) : undefined;
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: ctl?.signal });
    if (timer) clearTimeout(timer);
    void res.body?.cancel();
  } catch {
    // Connection refused / aborted / no listener — what we want.
    return;
  }
  throw new Error(
    `[demo] port ${port} is already in use — is another \`bun run demo\` running? Try: lsof -i :${port}`,
  );
}

async function waitForWorker(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // GET (not POST) — POST /api/room/new would mint a real Durable Object
      // room on every retry. Any HTTP response (incl. 4xx) means the worker is up.
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`[demo] worker at ${url} did not become ready in ${timeoutMs}ms`);
}

function openBrowser(url: string): void {
  const cmd =
    platform() === 'darwin'
      ? ['open', url]
      : platform() === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
}

// SLIDE_REMOTE_PLUGIN_OUT redirects deck-plugin output into demo/.cache/
// (gitignored) so the demo never dirties the committed minified bundle in
// `_extensions/slide-remote/`.
await mkdir(cacheDir, { recursive: true });
const pluginEnv = { SLIDE_REMOTE_PLUGIN_OUT: pluginBundle };
const children: ReturnType<typeof Bun.spawn>[] = [];

if (noWatch) {
  console.log('[demo] building plugin + phone UI…');
  await Promise.all([
    buildOnce('plugin', ['packages/deck-plugin/build.ts'], pluginEnv),
    buildOnce('phone-ui', ['packages/phone-ui/build.ts']),
  ]);
} else {
  console.log('[demo] building plugin + phone UI (watch)…');
  const startedAt = Date.now();
  children.push(spawnWatch('plugin', ['packages/deck-plugin/build.ts', '--watch'], pluginEnv));
  children.push(spawnWatch('phone-ui', ['packages/phone-ui/build.ts', '--watch']));
  await Promise.all([
    waitForFreshFile(pluginBundle, startedAt, 30_000),
    waitForFreshFile(phoneUiAsset, startedAt, 30_000),
  ]);
}

// Worker: wrangler dev, bound to 0.0.0.0 so a phone on Wi-Fi can pair.
await assertPortFree(WORKER_PORT);
await assertPortFree(DECK_PORT);
console.log(`[demo] starting worker on :${WORKER_PORT}`);
const wrangler = Bun.spawn(
  ['bunx', 'wrangler', 'dev', '--port', String(WORKER_PORT), '--ip', '0.0.0.0'],
  {
    cwd: resolve(repoRoot, 'packages', 'worker'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, NO_COLOR: '1' },
  },
);
children.push(wrangler);
await waitForWorker(`http://127.0.0.1:${WORKER_PORT}/`, 30_000);

const server = Bun.serve({
  port: DECK_PORT,
  hostname: '0.0.0.0',
  development: true,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === '/' ? '/index.html' : url.pathname;

    if (path === '/index.html') {
      return new Response(Bun.file(resolve(demoDir, 'index.html')), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (path === '/slide-remote.js') {
      return new Response(Bun.file(pluginBundle), {
        headers: { 'content-type': 'application/javascript; charset=utf-8' },
      });
    }
    if (path === '/slide-remote.css') {
      return new Response(Bun.file(pluginCss), {
        headers: { 'content-type': 'text/css; charset=utf-8' },
      });
    }
    return new Response('not found', { status: 404 });
  },
});

const ip = lanIp();
const localUrl = `http://127.0.0.1:${DECK_PORT}/`;
const lanUrl = `http://${ip}:${DECK_PORT}/`;
console.log('');
console.log(`  Deck:    ${localUrl}  (laptop only)`);
if (ip !== '127.0.0.1') console.log(`           ${lanUrl}  (open on a phone on the same Wi-Fi)`);
console.log(`  Worker:  http://127.0.0.1:${WORKER_PORT}`);
console.log('');
console.log('  Press Shift+R in the deck to summon the QR overlay.');
console.log('  Ctrl+C to stop.');
console.log('');

if (!noOpen) openBrowser(localUrl);

// Cleanup. macOS has no PR_SET_PDEATHSIG equivalent, so children don't die
// with the parent automatically. Cover every signal + the synchronous 'exit'
// callback as fallback. SIGKILL on the parent still leaves orphans.
let shuttingDown = false;
const killChildren = (signal: NodeJS.Signals = 'SIGINT'): void => {
  for (const c of children) {
    try {
      c.kill(signal);
    } catch {
      // already dead
    }
  }
};
const shutdown = (code = 0): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  killChildren('SIGINT');
  server.stop();
  process.exit(code);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const) {
  process.on(sig, () => shutdown(0));
}
process.on('uncaughtException', (e) => {
  console.error('[demo] uncaught:', e);
  shutdown(1);
});
process.on('unhandledRejection', (e) => {
  console.error('[demo] unhandled rejection:', e);
  shutdown(1);
});
process.on('exit', () => killChildren('SIGKILL'));

// Keep the event loop alive until SIGINT.
await new Promise(() => {});
