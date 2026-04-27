// Phone UI rendering — plain DOM, no framework.

import type { SlideState } from '@slide-remote/protocol';

export type ViewerStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface UI {
  root: HTMLElement;
  setStatus(text: string, state: ViewerStatus): void;
  setRoom(roomId: string): void;
  setPeerCount(presenter: number, viewer: number): void;
  setState(s: SlideState): void;
  showError(msg: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function buildUi(handlers: { onPrev: () => void; onNext: () => void }): UI {
  const dot = el('span', 'sr__dot');
  dot.dataset.state = 'connecting';
  dot.setAttribute('aria-hidden', 'true');
  const statusEl = el('span', 'sr__status', 'connecting…');
  const roomEl = el('span', 'sr__room');
  roomEl.setAttribute('aria-label', 'Room');
  const peerEl = el('span', 'sr__peer', '·');
  peerEl.setAttribute('aria-label', 'Phones in room');

  const top = el('header', 'sr__top');
  top.append(dot, statusEl, el('span', 'sr__spacer'), roomEl, peerEl);

  const posEl = el('div', 'sr__pos');
  const titleEl = el('div', 'sr__title', '—');
  const slide = el('div', 'sr__slide');
  slide.append(posEl, titleEl);

  const notesEl = el('div', 'sr__notes');
  notesEl.setAttribute('aria-live', 'polite');

  const errorEl = el('div', 'sr__error');
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = true;

  const body = el('main', 'sr__body');
  body.append(slide, notesEl, errorEl);

  const prevBtn = el('button', 'sr__btn sr__btn--prev', '◀');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.addEventListener('click', handlers.onPrev);
  const nextBtn = el('button', 'sr__btn sr__btn--next', '▶');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.addEventListener('click', handlers.onNext);

  const controls = el('footer', 'sr__controls');
  controls.append(prevBtn, nextBtn);

  const root = el('div', 'sr');
  root.append(top, body, controls);

  return {
    root,
    setStatus(text, state) {
      dot.dataset.state = state;
      statusEl.textContent = text;
    },
    setRoom(roomId) {
      roomEl.textContent = roomId.slice(0, 6);
    },
    setPeerCount(_presenter, viewer) {
      peerEl.textContent = viewer > 1 ? `${viewer} phones` : '·';
    },
    setState(s) {
      posEl.textContent = `${s.h + 1} / ${s.total}`;
      titleEl.textContent = s.title || '(untitled)';
      if (s.notesHtml) notesEl.innerHTML = s.notesHtml;
      else notesEl.textContent = 'No notes for this slide.';
    },
    showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    },
  };
}
