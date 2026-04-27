// Phone UI rendering — plain DOM, no framework.

import type { ServerMessage, SlideState } from '@slide-remote/protocol';

export interface UI {
  root: HTMLElement;
  setStatus(text: string, state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'): void;
  setRoom(roomId: string): void;
  setPeerCount(presenter: number, viewer: number): void;
  setState(s: SlideState): void;
  showError(msg: string): void;
}

export function buildUi(handlers: {
  onPrev: () => void;
  onNext: () => void;
}): UI {
  const root = document.createElement('div');
  root.className = 'sr';
  root.innerHTML = `
    <header class="sr__top">
      <span class="sr__dot" data-state="connecting" aria-hidden="true"></span>
      <span class="sr__status">connecting…</span>
      <span class="sr__spacer"></span>
      <span class="sr__room" aria-label="Room"></span>
      <span class="sr__peer" aria-label="Phones in room">·</span>
    </header>
    <main class="sr__body">
      <div class="sr__slide">
        <div class="sr__pos"></div>
        <div class="sr__title">—</div>
      </div>
      <div class="sr__notes" aria-live="polite"></div>
      <div class="sr__error" role="alert" hidden></div>
    </main>
    <footer class="sr__controls">
      <button class="sr__btn sr__btn--prev" type="button" aria-label="Previous slide">◀</button>
      <button class="sr__btn sr__btn--next" type="button" aria-label="Next slide">▶</button>
    </footer>
  `;

  const dot = root.querySelector<HTMLElement>('.sr__dot');
  const statusEl = root.querySelector<HTMLElement>('.sr__status');
  const roomEl = root.querySelector<HTMLElement>('.sr__room');
  const peerEl = root.querySelector<HTMLElement>('.sr__peer');
  const posEl = root.querySelector<HTMLElement>('.sr__pos');
  const titleEl = root.querySelector<HTMLElement>('.sr__title');
  const notesEl = root.querySelector<HTMLElement>('.sr__notes');
  const errorEl = root.querySelector<HTMLElement>('.sr__error');
  const prevBtn = root.querySelector<HTMLButtonElement>('.sr__btn--prev');
  const nextBtn = root.querySelector<HTMLButtonElement>('.sr__btn--next');

  prevBtn?.addEventListener('click', handlers.onPrev);
  nextBtn?.addEventListener('click', handlers.onNext);

  return {
    root,
    setStatus(text, state) {
      if (dot) dot.dataset['state'] = state;
      if (statusEl) statusEl.textContent = text;
    },
    setRoom(roomId) {
      if (roomEl) roomEl.textContent = roomId.slice(0, 6);
    },
    setPeerCount(_presenter, _viewer) {
      // Reserved for richer presence display in Phase 3.
    },
    setState(s) {
      if (posEl) posEl.textContent = `${s.h + 1} / ${s.total}`;
      if (titleEl) titleEl.textContent = s.title || '(untitled)';
      if (notesEl) {
        if (s.notesHtml) notesEl.innerHTML = s.notesHtml;
        else notesEl.textContent = 'No notes for this slide.';
      }
    },
    showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    },
  };
}

export function snapshotPayload(msg: ServerMessage): SlideState | null {
  return msg.t === 'state_snapshot' ? msg.payload : null;
}
