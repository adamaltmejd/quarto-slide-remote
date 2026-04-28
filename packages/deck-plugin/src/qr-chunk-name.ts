// Single source of truth for the lazy QR chunk filename. Imported by
// build.ts (to name the emitted file) and qr-loader.ts (to fetch it at
// runtime). Lives in its own module — free of any browser globals — so
// the Bun build script can import it without pulling in DOM-dependent code.
export const QR_CHUNK_FILENAME = 'slide-remote-qr.js';
