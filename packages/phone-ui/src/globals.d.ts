// Build-time constant injected by Bun.build's `define` (see build.ts).
// Sourced from the root package.json#version. Tests override it in
// test-setup.ts via globalThis.
declare const __SR_VERSION__: string;
