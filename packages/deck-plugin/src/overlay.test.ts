import { afterEach, describe, expect, test } from 'bun:test';
import { Overlay } from './overlay';

interface OverlayCtx {
  overlay: Overlay;
  closes: () => number;
}

const live: Overlay[] = [];

function newOverlay(): OverlayCtx {
  let closes = 0;
  const overlay = new Overlay('https://example.test/', {
    onClose: () => {
      closes++;
    },
  });
  live.push(overlay);
  return { overlay, closes: () => closes };
}

afterEach(() => {
  // Each Overlay attaches a capture-phase keydown listener on document and
  // owns the only reference to the handler. Detach by closing every overlay
  // the test created so listeners don't leak across tests.
  while (live.length > 0) live.pop()?.close();
  document.body.innerHTML = '';
});

describe('Overlay keyboard trap', () => {
  test('Escape closes the overlay', () => {
    const ctx = newOverlay();
    ctx.overlay.open('https://join.test/', 'ABCDEF');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ctx.closes()).toBe(1);
  });

  test('non-Escape keys do not close the overlay', () => {
    const ctx = newOverlay();
    ctx.overlay.open('https://join.test/', 'ABCDEF');
    for (const key of ['ArrowRight', 'ArrowLeft', 'n', 'p', 'b', 'o', ' ']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    expect(ctx.closes()).toBe(0);
  });

  test('keydowns are stopped from reaching bubble-phase document listeners while open', () => {
    const ctx = newOverlay();
    let bubbleHits = 0;
    const bubble = (): void => {
      bubbleHits++;
    };
    document.addEventListener('keydown', bubble);
    try {
      ctx.overlay.open('https://join.test/', 'ABCDEF');
      for (const key of ['ArrowRight', 'n', ' ', 'Escape']) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
      expect(bubbleHits).toBe(0);

      // After close, bubble listeners receive events again.
      ctx.overlay.close();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(bubbleHits).toBe(1);
    } finally {
      document.removeEventListener('keydown', bubble);
    }
  });

  test('close removes the document keydown listener', () => {
    const ctx = newOverlay();
    ctx.overlay.open('https://join.test/', 'ABCDEF');
    ctx.overlay.close();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ctx.closes()).toBe(0);
  });
});
