// Pairing overlay shown on the deck. Self-scoped under .sr-* so it cannot
// collide with theme styles. Visible only after presenter activation.

import { qrSvg } from './qr';

export interface OverlayHandlers {
  onClose: () => void;
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

function row(label: string, value: HTMLElement): HTMLDivElement {
  const r = el('div', 'sr-overlay__row');
  r.append(el('span', 'sr-overlay__label', label), value);
  return r;
}

export class Overlay {
  private root: HTMLDivElement;
  private qrHost: HTMLDivElement;
  private statusEl: HTMLSpanElement;
  private peerEl: HTMLSpanElement;
  private codeEl: HTMLSpanElement;
  private linkEl: HTMLAnchorElement;

  constructor(handlers: OverlayHandlers) {
    this.qrHost = el('div', 'sr-overlay__qr');
    this.codeEl = el('span', 'sr-overlay__code');
    this.statusEl = el('span', 'sr-overlay__status', 'connecting…');
    this.peerEl = el('span', 'sr-overlay__peer', '0');

    const closeBtn = el('button', 'sr-overlay__close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', handlers.onClose);

    const meta = el('div', 'sr-overlay__meta');
    meta.append(row('Room', this.codeEl), row('Status', this.statusEl), row('Phones', this.peerEl));

    // Plain-text fallback for users without a phone camera, and a quick way
    // to open the phone UI in a second browser window for a laptop-only test.
    this.linkEl = el('a', 'sr-overlay__link', 'open on this device');
    this.linkEl.target = '_blank';
    this.linkEl.rel = 'noopener noreferrer';

    const panel = el('div', 'sr-overlay__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Slide remote pairing');
    panel.append(
      closeBtn,
      el('h2', 'sr-overlay__title', 'Pair your phone'),
      this.qrHost,
      meta,
      this.linkEl,
      el('p', 'sr-overlay__hint', 'Scan with your iPhone camera. Press Esc to dismiss.'),
    );

    this.root = el('div', 'sr-overlay');
    this.root.appendChild(panel);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) handlers.onClose();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.root.isConnected) handlers.onClose();
    });
  }

  open(joinUrl: string, roomId: string): void {
    this.qrHost.innerHTML = qrSvg(joinUrl, 256);
    this.qrHost.dataset.joinUrl = joinUrl;
    this.codeEl.textContent = roomId;
    this.linkEl.href = joinUrl;
    if (!this.root.isConnected) document.body.appendChild(this.root);
  }

  close(): void {
    this.root.remove();
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
  private root: HTMLDivElement;
  private textEl: HTMLSpanElement;

  constructor() {
    const dot = el('span', 'sr-badge__dot');
    this.textEl = el('span', 'sr-badge__text', 'paired');
    this.root = el('div', 'sr-badge');
    this.root.append(dot, this.textEl);
  }

  attach(): void {
    if (!this.root.isConnected) document.body.appendChild(this.root);
  }

  setState(state: 'connected' | 'reconnecting' | 'disconnected', text: string): void {
    this.root.dataset.state = state;
    this.textEl.textContent = text;
  }
}
