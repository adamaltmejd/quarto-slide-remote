// Asserts the deck plugin is fully silent during decktape-style PDF rendering.
//
// Registers happy-dom globals (DOMParser, document, navigator, …), seeds URL
// params and meta tags so `shouldDisable()` returns true, evaluates the
// built _extensions/slide-remote/slide-remote.js, and calls the plugin's
// `init(...)` with a stub Reveal. Verifies:
//   - no WebSocket constructed
//   - no body children appended (no overlay, no badge, no trigger button)
//   - no keydown listeners attached to document
//   - no console writes
//
// Exit non-zero on any violation.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'https://example.com/lecture.html?handout=true' });

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const bundlePath = resolve(repoRoot, '_extensions', 'slide-remote', 'slide-remote.js');

const violations: string[] = [];

// Meta tags that filter.lua emits for a typical consumer.
for (const [name, content] of [
  ['slide-remote-worker-url', 'https://example.workers.dev'],
  ['slide-remote-show-button', 'true'],
  ['slide-remote-disable-on-params', 'handout'],
]) {
  const m = document.createElement('meta');
  m.setAttribute('name', name);
  m.setAttribute('content', content);
  document.head.appendChild(m);
}

// Capture WebSocket construction.
let wsCount = 0;
const RealWS = globalThis.WebSocket;
class TrackedWS extends (RealWS as unknown as typeof WebSocket) {
  constructor(url: string | URL, protocols?: string | string[]) {
    wsCount++;
    super(url, protocols);
  }
}
(globalThis as { WebSocket: typeof WebSocket }).WebSocket =
  TrackedWS as unknown as typeof WebSocket;

// Capture console writes.
const consoleWrites: string[] = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console);
  console[level] = ((...args: unknown[]) => {
    consoleWrites.push(`${level}: ${args.map(String).join(' ')}`);
    original(...args);
  }) as typeof console.log;
}

// Capture body mutations.
const bodyChildrenBefore = document.body.children.length;

// Track keydown listeners attached to document.
let keydownListeners = 0;
const realAdd = document.addEventListener.bind(document);
// biome-ignore lint/suspicious/noExplicitAny: addEventListener overloads
document.addEventListener = ((type: string, ...rest: unknown[]) => {
  if (type === 'keydown') keydownListeners++;
  return (realAdd as any)(type, ...rest);
}) as typeof document.addEventListener;

// Stub Reveal: only the methods init() touches.
const reveal = {
  on: () => {},
  off: () => {},
  next: () => {},
  prev: () => {},
  slide: () => {},
  togglePause: () => {},
  isPaused: () => false,
  isOverview: () => false,
  getCurrentSlide: () => undefined,
  getSlide: () => undefined,
  getIndices: () => ({ h: 0, v: 0 }),
  getTotalSlides: () => 0,
  addKeyBinding: () => {},
};

// Evaluate the IIFE in the global scope.
const code = await readFile(bundlePath, 'utf8');
// biome-ignore lint/security/noGlobalEval: bundle is built from our own source
(0, eval)(code);

const SlideRemote = (globalThis as { SlideRemote?: () => { init: (r: unknown) => void } })
  .SlideRemote;
if (typeof SlideRemote !== 'function') {
  violations.push('window.SlideRemote was not registered by the bundle');
} else {
  const plugin = SlideRemote();
  plugin.init(reveal);
}

const bodyChildrenAfter = document.body.children.length;

if (wsCount !== 0) violations.push(`WebSocket constructed ${wsCount} times`);
if (bodyChildrenAfter !== bodyChildrenBefore) {
  violations.push(`body children mutated: ${bodyChildrenBefore} → ${bodyChildrenAfter}`);
}
if (keydownListeners !== 0) {
  violations.push(`keydown listeners attached: ${keydownListeners}`);
}
if (consoleWrites.length !== 0) {
  violations.push(`console writes:\n  ${consoleWrites.join('\n  ')}`);
}

if (violations.length === 0) {
  console.log('[decktape-silent] OK — plugin is silent under ?handout=true');
  GlobalRegistrator.unregister();
  process.exit(0);
}

console.error('[decktape-silent] FAIL:');
for (const v of violations) console.error(`  - ${v}`);
GlobalRegistrator.unregister();
process.exit(1);
