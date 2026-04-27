// Asserts the deck plugin is fully silent in every bail-out scenario.
//
// Registers happy-dom globals (DOMParser, document, navigator, …), evaluates
// the built _extensions/slide-remote/slide-remote.js once, then for each
// scenario seeds URL params + meta tags, calls the plugin's `init(...)` with
// a stub Reveal, and verifies:
//   - no WebSocket constructed
//   - no body children appended (no overlay, no badge, no trigger button)
//   - no keydown listeners attached to document
//   - no console writes
//
// Scenarios cover:
//   1. `?handout=true` with a configured worker-url (decktape-style render)
//   2. consumer didn't set worker-url at all (filter.lua emits empty content)
//   3. per-deck kill switch via <meta name="slide-remote-enabled" content="false">
//
// Exit non-zero on any violation in any scenario.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'https://example.com/lecture.html' });

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const bundlePath = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');

// --- side-effect counters (reset per scenario) ---
let wsCount = 0;
let keydownListeners = 0;
let consoleWrites: string[] = [];

// Capture WebSocket construction.
const RealWS = globalThis.WebSocket;
class TrackedWS extends (RealWS as unknown as typeof WebSocket) {
  constructor(url: string | URL, protocols?: string | string[]) {
    wsCount++;
    super(url, protocols);
  }
}
(globalThis as { WebSocket: typeof WebSocket }).WebSocket =
  TrackedWS as unknown as typeof WebSocket;

// Capture console writes; keep originals for our own reporting.
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
};
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console);
  console[level] = ((...args: unknown[]) => {
    consoleWrites.push(`${level}: ${args.map(String).join(' ')}`);
    original(...args);
  }) as typeof console.log;
}

// Track keydown listeners attached to document.
type AddEventListener = typeof document.addEventListener;
const realAdd = document.addEventListener.bind(document) as AddEventListener;
document.addEventListener = ((
  type: Parameters<AddEventListener>[0],
  listener: Parameters<AddEventListener>[1],
  options?: Parameters<AddEventListener>[2],
) => {
  if (type === 'keydown') keydownListeners++;
  realAdd(type, listener, options);
}) as AddEventListener;

// Stub Reveal: only the methods init() touches.
const reveal = {
  on: () => {},
  next: () => {},
  prev: () => {},
  slide: () => {},
  togglePause: () => {},
  isPaused: () => false,
  getCurrentSlide: () => undefined,
  getSlide: () => undefined,
  getIndices: () => ({ h: 0, v: 0 }),
  getTotalSlides: () => 0,
};

// Evaluate the IIFE in the global scope. Aliasing eval to a local binding
// invokes it as an indirect call so it runs in the global lexical scope.
const code = await readFile(bundlePath, 'utf8');
// biome-ignore lint/security/noGlobalEval: bundle is built from our own source
const indirectEval = eval;
indirectEval(code);

const SlideRemote = (globalThis as { SlideRemote?: () => { init: (r: unknown) => void } })
  .SlideRemote;
if (typeof SlideRemote !== 'function') {
  originalConsole.error('[decktape-silent] FAIL: window.SlideRemote not registered by the bundle');
  GlobalRegistrator.unregister();
  process.exit(1);
}

interface Scenario {
  name: string;
  path: string; // pathname + search
  metas: Record<string, string>;
}

const scenarios: Scenario[] = [
  {
    name: 'decktape ?handout=true with disable-on-params',
    path: '/lecture.html?handout=true',
    metas: {
      'slide-remote-worker-url': 'https://example.workers.dev',
      'slide-remote-show-button': 'true',
      'slide-remote-disable-on-params': 'handout',
    },
  },
  {
    name: 'consumer omitted worker-url (filter.lua emits empty content)',
    path: '/lecture.html',
    metas: {
      'slide-remote-worker-url': '',
      'slide-remote-show-button': 'false',
      'slide-remote-disable-on-params': '',
    },
  },
  {
    name: 'per-deck kill switch <meta slide-remote-enabled="false">',
    path: '/lecture.html',
    metas: {
      'slide-remote-worker-url': 'https://example.workers.dev',
      'slide-remote-show-button': 'true',
      'slide-remote-disable-on-params': '',
      'slide-remote-enabled': 'false',
    },
  },
];

const violations: string[] = [];

for (const sc of scenarios) {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  history.replaceState(null, '', sc.path);
  for (const [name, content] of Object.entries(sc.metas)) {
    const m = document.createElement('meta');
    m.setAttribute('name', name);
    m.setAttribute('content', content);
    document.head.appendChild(m);
  }

  wsCount = 0;
  keydownListeners = 0;
  consoleWrites = [];
  const bodyChildrenBefore = document.body.children.length;

  SlideRemote().init(reveal);

  const bodyChildrenAfter = document.body.children.length;
  if (wsCount !== 0) violations.push(`[${sc.name}] WebSocket constructed ${wsCount} times`);
  if (bodyChildrenAfter !== bodyChildrenBefore) {
    violations.push(
      `[${sc.name}] body children mutated: ${bodyChildrenBefore} → ${bodyChildrenAfter}`,
    );
  }
  if (keydownListeners !== 0) {
    violations.push(`[${sc.name}] keydown listeners attached: ${keydownListeners}`);
  }
  if (consoleWrites.length !== 0) {
    violations.push(`[${sc.name}] console writes:\n    ${consoleWrites.join('\n    ')}`);
  }
}

if (violations.length === 0) {
  originalConsole.log(
    `[decktape-silent] OK — silent across ${scenarios.length} bail-out scenarios`,
  );
  GlobalRegistrator.unregister();
  process.exit(0);
}

originalConsole.error('[decktape-silent] FAIL:');
for (const v of violations) originalConsole.error(`  - ${v}`);
GlobalRegistrator.unregister();
process.exit(1);
