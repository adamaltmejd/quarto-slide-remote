// Pairing overlay shown on the deck. Self-scoped under .sr-* so it cannot
// collide with theme styles. Visible only after presenter activation.

import { qrSvg } from './qr';

export interface OverlayHandlers {
  onClose: () => void;
}

export class Overlay {
  private el: HTMLDivElement;
  private statusEl: HTMLSpanElement;
  private peerEl: HTMLSpanElement;
  private codeEl: HTMLSpanElement;

  constructor(handlers: OverlayHandlers) {
    this.el = document.createElement('div');
    this.el.className = 'sr-overlay';
    this.el.innerHTML = `
      <div class="sr-overlay__panel" role="dialog" aria-modal="true" aria-label="Slide remote pairing">
        <button class="sr-overlay__close" type="button" aria-label="Close">×</button>
        <h2 class="sr-overlay__title">Pair your phone</h2>
        <div class="sr-overlay__qr"></div>
        <div class="sr-overlay__meta">
          <div class="sr-overlay__row"><span class="sr-overlay__label">Room</span><span class="sr-overlay__code"></span></div>
          <div class="sr-overlay__row"><span class="sr-overlay__label">Status</span><span class="sr-overlay__status">connecting…</span></div>
          <div class="sr-overlay__row"><span class="sr-overlay__label">Phones</span><span class="sr-overlay__peer">0</span></div>
        </div>
        <p class="sr-overlay__hint">Scan with your iPhone camera. Press Esc to dismiss.</p>
      </div>
    `;

    const closeBtn = this.el.querySelector<HTMLButtonElement>('.sr-overlay__close');
    closeBtn?.addEventListener('click', handlers.onClose);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) handlers.onClose();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.el.isConnected) handlers.onClose();
    });

    this.statusEl = this.el.querySelector<HTMLSpanElement>(
      '.sr-overlay__status',
    ) as HTMLSpanElement;
    this.peerEl = this.el.querySelector<HTMLSpanElement>('.sr-overlay__peer') as HTMLSpanElement;
    this.codeEl = this.el.querySelector<HTMLSpanElement>('.sr-overlay__code') as HTMLSpanElement;
  }

  open(joinUrl: string, roomId: string): void {
    const qrHost = this.el.querySelector<HTMLDivElement>('.sr-overlay__qr');
    if (qrHost) {
      qrHost.innerHTML = qrSvg(joinUrl, 256);
      qrHost.dataset.joinUrl = joinUrl;
    }
    this.codeEl.textContent = roomId;
    if (!this.el.isConnected) document.body.appendChild(this.el);
  }

  close(): void {
    this.el.remove();
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  setPeerCount(n: number): void {
    this.peerEl.textContent = String(n);
  }
}

// Tiny non-blocking status badge in the corner once paired, so the presenter
// always sees connection state without the full overlay.
export class StatusBadge {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sr-badge';
    this.el.innerHTML = `<span class="sr-badge__dot"></span><span class="sr-badge__text">paired</span>`;
  }

  attach(): void {
    if (!this.el.isConnected) document.body.appendChild(this.el);
  }

  detach(): void {
    this.el.remove();
  }

  setState(state: 'connected' | 'reconnecting' | 'disconnected', text: string): void {
    this.el.dataset.state = state;
    const t = this.el.querySelector<HTMLSpanElement>('.sr-badge__text');
    if (t) t.textContent = text;
  }
}
