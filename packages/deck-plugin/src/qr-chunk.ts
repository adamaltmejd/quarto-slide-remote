// Lazy-loaded chunk: pulls in qrcode-generator (~50 KB raw) and exposes
// window.SlideRemoteQR.svg, which the main bundle calls once the pairing
// overlay is opened. Splitting this out keeps the 99% non-paired case
// from paying the QR library's parse cost on every deck load.

import { qrSvg } from './qr';

declare global {
  interface Window {
    SlideRemoteQR?: { svg: (text: string, sizePx?: number) => string };
  }
}

window.SlideRemoteQR = { svg: qrSvg };
