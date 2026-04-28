import { describe, expect, test } from 'bun:test';
import { extractState } from './extract';
import type { RevealApi } from './types';

function makeSlide(html: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const el = tpl.content.firstElementChild as HTMLElement;
  if (!el) throw new Error('makeSlide: empty html');
  return el;
}

function makeReveal(opts: {
  current: HTMLElement;
  indices?: { h: number; v: number; f?: number };
  total?: number;
  paused?: boolean;
  slides?: Record<string, HTMLElement | undefined>;
}): RevealApi {
  const indices = opts.indices ?? { h: 0, v: 0 };
  const slides = opts.slides ?? {};
  return {
    on: () => {},
    next: () => {},
    prev: () => {},
    togglePause: () => {},
    isPaused: () => opts.paused ?? false,
    getCurrentSlide: () => opts.current,
    getSlide: (h, v) => slides[`${h}.${v ?? 0}`],
    getIndices: () => indices,
    getTotalSlides: () => opts.total ?? 1,
  };
}

describe('extractState — title fallback', () => {
  test('uses first h2 textContent', () => {
    const slide = makeSlide(`<section><h2>The Title</h2><p>body</p></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').title).toBe('The Title');
  });

  test('falls through h1, h2, h3 when only h3 present', () => {
    const slide = makeSlide(`<section><h3>Sub</h3></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').title).toBe('Sub');
  });

  test('uses data-name when no heading', () => {
    const slide = makeSlide(`<section data-name="Named"><p>x</p></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').title).toBe('Named');
  });

  test('returns undefined with no heading and no data-name', () => {
    const slide = makeSlide(`<section><p>just body</p></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').title).toBeUndefined();
  });

  test('only direct-child headings count, ignores nested', () => {
    const slide = makeSlide(`<section><div><h2>nested</h2></div><h3>direct</h3></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').title).toBe('direct');
  });

  test('h1 wins over h2 even when h2 comes first in DOM order', () => {
    const slide = makeSlide(`<section><h2>second</h2><h1>first</h1></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').title).toBe('first');
  });

  test('skips empty headings to fall through to next level', () => {
    const slide = makeSlide(`<section><h1>   </h1><h2>real</h2></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').title).toBe('real');
  });
});

describe('extractState — notes', () => {
  test('reads aside.notes innerHTML and sanitizes', () => {
    const slide = makeSlide(`
      <section>
        <h2>t</h2>
        <aside class="notes"><p>note <strong>bold</strong></p><script>x</script></aside>
      </section>
    `);
    const reveal = makeReveal({ current: slide });
    const state = extractState(reveal, 'r');
    expect(state.notesHtml).toContain('<p>note <strong>bold</strong></p>');
    expect(state.notesHtml).not.toContain('<script>');
  });

  test('returns undefined when there are no notes', () => {
    const slide = makeSlide(`<section><h2>t</h2></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').notesHtml).toBeUndefined();
  });

  test('caches sanitized notes per aside element', () => {
    const slide = makeSlide(`<section><h2>t</h2><aside class="notes"><p>v1</p></aside></section>`);
    const reveal = makeReveal({ current: slide });
    const first = extractState(reveal, 'r').notesHtml;
    // Mutating innerHTML in place should NOT invalidate — proves the
    // second call hit the cache instead of re-reading + re-sanitizing.
    const aside = slide.querySelector(':scope > aside.notes');
    if (!aside) throw new Error('aside missing');
    aside.innerHTML = '<p>v2-should-be-ignored</p>';
    const second = extractState(reveal, 'r').notesHtml;
    expect(second).toBe(first);
  });

  test('caps notes at 64 KB and degrades to plain text', () => {
    const huge = `<p>${'x'.repeat(70 * 1024)}</p>`;
    const slide = makeSlide(`<section><h2>t</h2><aside class="notes">${huge}</aside></section>`);
    const reveal = makeReveal({ current: slide });
    const notes = extractState(reveal, 'r').notesHtml ?? '';
    expect(notes.length).toBeLessThanOrEqual(64 * 1024);
    // Degraded to plain text so it should not contain HTML tags.
    expect(notes).not.toContain('<p>');
  });
});

describe('extractState — next-slide title', () => {
  test('finds vertical next first', () => {
    const current = makeSlide(`<section><h2>cur</h2></section>`);
    const vNext = makeSlide(`<section><h2>vNext</h2></section>`);
    const hNext = makeSlide(`<section><h2>hNext</h2></section>`);
    const reveal = makeReveal({
      current,
      indices: { h: 0, v: 0 },
      slides: { '0.1': vNext, '1.0': hNext },
    });
    expect(extractState(reveal, 'r').nextTitle).toBe('vNext');
  });

  test('falls back to next horizontal stack', () => {
    const current = makeSlide(`<section><h2>cur</h2></section>`);
    const hNext = makeSlide(`<section><h2>hNext</h2></section>`);
    const reveal = makeReveal({
      current,
      indices: { h: 0, v: 0 },
      slides: { '1.0': hNext },
    });
    expect(extractState(reveal, 'r').nextTitle).toBe('hNext');
  });

  test('undefined on the last slide', () => {
    const current = makeSlide(`<section><h2>last</h2></section>`);
    const reveal = makeReveal({ current, indices: { h: 0, v: 0 }, slides: {} });
    expect(extractState(reveal, 'r').nextTitle).toBeUndefined();
  });
});

describe('extractState — fragments and indices', () => {
  test('counts hidden fragments only', () => {
    const slide = makeSlide(`
      <section>
        <h2>t</h2>
        <span class="fragment visible">a</span>
        <span class="fragment">b</span>
        <span class="fragment">c</span>
      </section>
    `);
    const reveal = makeReveal({ current: slide, indices: { h: 2, v: 1, f: 0 }, total: 9 });
    const s = extractState(reveal, 'rid');
    expect(s.fragmentsLeft).toBe(2);
    expect(s.h).toBe(2);
    expect(s.v).toBe(1);
    expect(s.f).toBe(0);
    expect(s.total).toBe(9);
    expect(s.roomId).toBe('rid');
    expect(typeof s.ts).toBe('number');
  });

  test('isPaused passed through', () => {
    const slide = makeSlide(`<section><h2>t</h2></section>`);
    const reveal = makeReveal({ current: slide, paused: true });
    expect(extractState(reveal, 'r').isPaused).toBe(true);
  });

  test('startedAt is forwarded onto the snapshot', () => {
    const slide = makeSlide(`<section><h2>t</h2></section>`);
    const reveal = makeReveal({ current: slide });
    expect(extractState(reveal, 'r').startedAt).toBeUndefined();
    expect(extractState(reveal, 'r', 1700000000000).startedAt).toBe(1700000000000);
  });
});
