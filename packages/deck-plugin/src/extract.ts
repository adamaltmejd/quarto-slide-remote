// Extract slide state from Reveal + the DOM. Theme-agnostic: depends only on
// the public Reveal API and the standard `<aside class="notes">` contract.

import type { SlideState } from '@slide-remote/protocol';
import { sanitizeNotesHtml } from './sanitize';
import type { RevealApi } from './types';

const MAX_NOTES_BYTES = 64 * 1024;

function slideTitle(slide: HTMLElement | undefined): string | undefined {
  if (!slide) return undefined;
  // Prefer h1, then h2, then h3 — strict by level, not DOM order. A
  // comma-selector would return whichever appeared first in the document.
  for (const tag of ['h1', 'h2', 'h3'] as const) {
    const text = slide.querySelector(`:scope > ${tag}`)?.textContent?.trim();
    if (text) return text;
  }
  const named = slide.getAttribute('data-name');
  return named?.trim() || undefined;
}

function slideNotes(slide: HTMLElement | undefined): string | undefined {
  if (!slide) return undefined;
  const aside = slide.querySelector(':scope > aside.notes');
  if (!aside) return undefined;
  let html = sanitizeNotesHtml(aside.innerHTML);
  if (html.length > MAX_NOTES_BYTES) {
    // Degrade to plain text if a knitr-rendered chunk blew past the cap.
    html = (aside.textContent ?? '').slice(0, MAX_NOTES_BYTES);
  }
  return html || undefined;
}

function fragmentsLeft(slide: HTMLElement | undefined): number {
  if (!slide) return 0;
  return slide.querySelectorAll('.fragment:not(.visible)').length;
}

function nextSlideTitle(reveal: RevealApi, h: number, v: number): string | undefined {
  // Try the next vertical slide first, then the next horizontal stack.
  const vNext = reveal.getSlide(h, v + 1);
  if (vNext) return slideTitle(vNext);
  const hNext = reveal.getSlide(h + 1, 0);
  return hNext ? slideTitle(hNext) : undefined;
}

export function extractState(reveal: RevealApi, roomId: string, startedAt?: number): SlideState {
  const slide = reveal.getCurrentSlide();
  const idx = reveal.getIndices();
  return {
    roomId,
    h: idx.h,
    v: idx.v,
    f: idx.f,
    total: reveal.getTotalSlides(),
    title: slideTitle(slide),
    notesHtml: slideNotes(slide),
    nextTitle: nextSlideTitle(reveal, idx.h, idx.v),
    fragmentsLeft: fragmentsLeft(slide),
    isPaused: reveal.isPaused(),
    startedAt,
    ts: Date.now(),
  };
}
