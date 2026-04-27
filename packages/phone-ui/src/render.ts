// Phone UI rendering — plain DOM, no framework.

import type { SlideState } from '@slide-remote/protocol';
import type { ViewerStatus } from './ws';

export type { ViewerStatus };

export interface UI {
  root: HTMLElement;
  setStatus(text: string, state: ViewerStatus): void;
  setRoom(roomId: string): void;
  setPeerCount(presenter: number, viewer: number): void;
  setState(s: SlideState): void;
  showError(msg: string): void;
}

export interface UIHandlers {
  onPrev: () => void;
  onNext: () => void;
  onPause: () => void;
}

const NOTES_SIZE_KEY = 'slide-remote.notes-size';
const NOTES_SIZE_STEPS = [0.85, 1, 1.15, 1.3, 1.5] as const;
const NOTES_SIZE_DEFAULT_INDEX = 1;

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

function loadNotesSizeIndex(): number {
  try {
    const raw = localStorage.getItem(NOTES_SIZE_KEY);
    if (raw === null) return NOTES_SIZE_DEFAULT_INDEX;
    const idx = Number.parseInt(raw, 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= NOTES_SIZE_STEPS.length) {
      return NOTES_SIZE_DEFAULT_INDEX;
    }
    return idx;
  } catch {
    return NOTES_SIZE_DEFAULT_INDEX;
  }
}

function saveNotesSizeIndex(idx: number): void {
  try {
    localStorage.setItem(NOTES_SIZE_KEY, String(idx));
  } catch {
    // Safari private mode etc. — ignore.
  }
}

export function buildUi(handlers: UIHandlers): UI {
  // ── top bar ──────────────────────────────────────────────────────────────
  const dot = el('span', 'sr__dot');
  dot.dataset.state = 'connecting';
  dot.setAttribute('aria-hidden', 'true');
  const statusEl = el('span', 'sr__status', 'connecting…');
  const roomEl = el('span', 'sr__room');
  roomEl.setAttribute('aria-label', 'Room');
  const peerEl = el('span', 'sr__peer', '');
  peerEl.setAttribute('aria-label', 'Phones in room');

  const sizeDown = el('button', 'sr__size-btn', 'A−');
  sizeDown.type = 'button';
  sizeDown.setAttribute('aria-label', 'Decrease notes text size');
  const sizeUp = el('button', 'sr__size-btn', 'A+');
  sizeUp.type = 'button';
  sizeUp.setAttribute('aria-label', 'Increase notes text size');
  const sizeGroup = el('span', 'sr__size');
  sizeGroup.append(sizeDown, sizeUp);

  const top = el('header', 'sr__top');
  top.append(dot, statusEl, el('span', 'sr__spacer'), peerEl, roomEl, sizeGroup);

  // ── title block ──────────────────────────────────────────────────────────
  const posEl = el('span', 'sr__pos');
  const titleEl = el('span', 'sr__title-text', '—');
  const titleRow = el('div', 'sr__title');
  titleRow.append(posEl, titleEl);

  const nextLabel = el('span', 'sr__next-label', 'Next:');
  const nextEl = el('span', 'sr__next-text', '—');
  const nextRow = el('div', 'sr__next');
  nextRow.append(nextLabel, nextEl);

  const titleBlock = el('div', 'sr__head');
  titleBlock.append(titleRow, nextRow);

  // ── notes ────────────────────────────────────────────────────────────────
  const notesEl = el('div', 'sr__notes');
  notesEl.setAttribute('aria-live', 'polite');

  // ── error ────────────────────────────────────────────────────────────────
  const errorEl = el('div', 'sr__error');
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = true;

  const body = el('main', 'sr__body');
  body.append(titleBlock, notesEl, errorEl);

  // ── controls ─────────────────────────────────────────────────────────────
  const nextBtn = el('button', 'sr__btn sr__btn--next', 'NEXT');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.addEventListener('click', handlers.onNext);

  const prevBtn = el('button', 'sr__btn sr__btn--prev', 'PREV');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.addEventListener('click', handlers.onPrev);

  const pauseBtn = el('button', 'sr__btn sr__btn--pause', 'PAUSE');
  pauseBtn.type = 'button';
  pauseBtn.dataset.active = 'false';
  pauseBtn.setAttribute('aria-label', 'Black screen');
  pauseBtn.setAttribute('aria-pressed', 'false');
  pauseBtn.addEventListener('click', handlers.onPause);

  const secondaryRow = el('div', 'sr__row');
  secondaryRow.append(prevBtn, pauseBtn);

  const controls = el('footer', 'sr__controls');
  controls.append(nextBtn, secondaryRow);

  // ── root ─────────────────────────────────────────────────────────────────
  const root = el('div', 'sr');
  root.append(top, body, controls);

  // ── notes text-size persistence ──────────────────────────────────────────
  let sizeIdx = loadNotesSizeIndex();
  const applySize = (): void => {
    notesEl.style.setProperty('--sr-notes-scale', String(NOTES_SIZE_STEPS[sizeIdx]));
    sizeDown.disabled = sizeIdx <= 0;
    sizeUp.disabled = sizeIdx >= NOTES_SIZE_STEPS.length - 1;
  };
  sizeDown.addEventListener('click', () => {
    if (sizeIdx <= 0) return;
    sizeIdx--;
    saveNotesSizeIndex(sizeIdx);
    applySize();
  });
  sizeUp.addEventListener('click', () => {
    if (sizeIdx >= NOTES_SIZE_STEPS.length - 1) return;
    sizeIdx++;
    saveNotesSizeIndex(sizeIdx);
    applySize();
  });
  applySize();

  return {
    root,
    setStatus(text, state) {
      dot.dataset.state = state;
      statusEl.textContent = text;
      root.dataset.connection = state;
    },
    setRoom(roomId) {
      roomEl.textContent = roomId.slice(0, 6);
    },
    setPeerCount(_presenter, viewer) {
      peerEl.textContent = viewer > 1 ? `${viewer} phones` : '';
    },
    setState(s) {
      posEl.textContent = `${s.h + 1} / ${s.total}`;
      titleEl.textContent = s.title || '(untitled)';
      if (s.nextTitle) {
        nextEl.textContent = s.nextTitle;
        nextRow.hidden = false;
      } else {
        nextEl.textContent = '';
        nextRow.hidden = true;
      }
      if (s.notesHtml) notesEl.innerHTML = s.notesHtml;
      else notesEl.textContent = 'No notes for this slide.';
      const paused = s.isPaused === true;
      pauseBtn.dataset.active = paused ? 'true' : 'false';
      pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
    },
    showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    },
  };
}
