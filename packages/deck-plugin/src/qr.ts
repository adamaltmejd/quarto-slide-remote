// Generate an SVG QR code from arbitrary text. Wraps qrcode-generator with
// sensible defaults for short pairing URLs.

import qrcode from 'qrcode-generator';

export function qrSvg(text: string, sizePx = 256): string {
  // typeNumber 0 = auto-pick; 'M' error correction balances density and robustness.
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  // Render into an inline-friendly SVG with a transparent background.
  const cells = qr.getModuleCount();
  const cellSize = sizePx / cells;
  let path = '';
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (qr.isDark(r, c)) {
        path += `M${(c * cellSize).toFixed(3)},${(r * cellSize).toFixed(3)}h${cellSize.toFixed(3)}v${cellSize.toFixed(3)}h-${cellSize.toFixed(3)}z`;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}">` +
    `<rect width="${sizePx}" height="${sizePx}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`
  );
}
