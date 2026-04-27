// Local demo: builds the plugin + phone UI, boots `wrangler dev` for the
// Worker, serves a fixture reveal.js deck, and opens it in the default
// browser. Lets you exercise the product end-to-end without a separate
// consumer slides repo.
//
// Usage:
//   bun run demo                # builds, watches, serves, opens browser
//   bun run demo -- --no-open   # don't auto-open the browser
//   bun run demo -- --no-watch  # build once and exit watch mode

import { networkInterfaces, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const demoDir = resolve(repoRoot, 'demo');
const pluginBundle = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');
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

async function buildOnce(label: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(['bun', ...args], {
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`[demo] ${label} build failed (exit ${code})`);
}

function spawnWatch(label: string, args: string[]): ReturnType<typeof Bun.spawn> {
  const proc = Bun.spawn(['bun', ...args], {
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  void proc.exited.then((code) => {
    if (code !== 0) console.error(`[demo] ${label} watch exited ${code}`);
  });
  return proc;
}

async function waitForWorker(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok || res.status < 500) return;
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

// ── 1. Initial builds ─────────────────────────────────────────────────────
console.log('[demo] building plugin + phone UI…');
await Promise.all([
  buildOnce('plugin', ['packages/deck-plugin/build.ts']),
  buildOnce('phone-ui', ['packages/phone-ui/build.ts']),
]);

// ── 2. Watchers (rebuild on src changes) ──────────────────────────────────
const children: ReturnType<typeof Bun.spawn>[] = [];
if (!noWatch) {
  children.push(spawnWatch('plugin', ['packages/deck-plugin/build.ts', '--watch']));
  children.push(spawnWatch('phone-ui', ['packages/phone-ui/build.ts', '--watch']));
}

// ── 3. Worker (wrangler dev, bound to 0.0.0.0 so a phone on Wi-Fi can pair)
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
await waitForWorker(`http://127.0.0.1:${WORKER_PORT}/api/room/new`, 30_000);

// ── 4. Static deck server ─────────────────────────────────────────────────
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

// ── 5. Banner + browser ───────────────────────────────────────────────────
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

// ── 6. Cleanup ────────────────────────────────────────────────────────────
const shutdown = (): void => {
  for (const c of children) c.kill('SIGINT');
  server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Keep the event loop alive until SIGINT.
await new Promise(() => {});
