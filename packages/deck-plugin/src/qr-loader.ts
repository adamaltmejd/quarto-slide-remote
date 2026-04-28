// Runtime loader for the lazy QR chunk. Inserts <script src> on first call
// and caches the resulting promise so concurrent / repeat opens don't stack
// duplicate fetches.
//
// The chunk URL is derived from the plugin's own script element (captured
// at module init in index.ts) so it works regardless of where the consumer
// hosts the deck.

type QrApi = NonNullable<Window['SlideRemoteQR']>;

let cached: Promise<QrApi> | undefined;

export function loadQrChunk(base: string): Promise<QrApi> {
  if (window.SlideRemoteQR) return Promise.resolve(window.SlideRemoteQR);
  if (cached) return cached;
  cached = new Promise<QrApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}slide-remote-qr.js`;
    script.async = true;
    script.addEventListener('load', () => {
      if (window.SlideRemoteQR) resolve(window.SlideRemoteQR);
      else reject(new Error('slide-remote-qr.js loaded but window.SlideRemoteQR not set'));
    });
    script.addEventListener('error', () => {
      cached = undefined; // allow retry on a later open
      reject(new Error(`failed to load ${script.src}`));
    });
    document.head.appendChild(script);
  });
  return cached;
}
