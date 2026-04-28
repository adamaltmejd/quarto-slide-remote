// Pairing overlay shown on the deck. Self-scoped under .sr-* so it cannot
// collide with theme styles. Visible only after presenter activation.

import { loadQrChunk } from './qr-loader';

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
  private codeEl: HTMLSpanElement;
  private linkEl: HTMLAnchorElement;
  private lastJoinUrl?: string;
  private onKeydown: (e: KeyboardEvent) => void;

  constructor(
    private pluginBase: string,
    handlers: OverlayHandlers,
  ) {
    this.qrHost = el('div', 'sr-overlay__qr');
    this.codeEl = el('span', 'sr-overlay__code');
    this.statusEl = el('span', 'sr-overlay__status', 'connecting…');

    const closeBtn = el('button', 'sr-overlay__close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', handlers.onClose);

    const meta = el('div', 'sr-overlay__meta');
    meta.append(row('Room', this.codeEl), row('Status', this.statusEl));

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
      el('p', 'sr-overlay__hint', 'Press Esc to dismiss.'),
    );

    this.root = el('div', 'sr-overlay');
    this.root.appendChild(panel);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) handlers.onClose();
    });

    this.onKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handlers.onClose();
    };
  }

  open(joinUrl: string, roomId: string): void {
    if (joinUrl !== this.lastJoinUrl) {
      this.qrHost.dataset.joinUrl = joinUrl;
      this.linkEl.href = joinUrl;
      this.lastJoinUrl = joinUrl;
      void this.fillQr(joinUrl);
    }
    this.codeEl.textContent = roomId;
    if (!this.root.isConnected) {
      document.body.appendChild(this.root);
      document.addEventListener('keydown', this.onKeydown);
    }
  }

  private async fillQr(joinUrl: string): Promise<void> {
    try {
      const qr = await loadQrChunk(this.pluginBase);
      // Guard against rapid re-opens with a different joinUrl: the chunk may
      // have started loading for an earlier URL. Only render if we're still
      // showing the URL that kicked off this load.
      if (joinUrl === this.lastJoinUrl) {
        this.qrHost.innerHTML = qr.svg(joinUrl, 256);
      }
    } catch (e) {
      console.error('[slide-remote] QR load failed:', e);
      if (joinUrl === this.lastJoinUrl) {
        this.qrHost.textContent = 'Could not load QR — open the link below.';
      }
    }
  }

  close(): void {
    if (!this.root.isConnected) return;
    document.removeEventListener('keydown', this.onKeydown);
    this.root.remove();
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }
}

// Tiny non-blocking status badge in the corner once paired, so the presenter
// always sees connection state without the full overlay.
//
// Flash choreography for the 'connected' state: the badge's steady-state is
// invisible (the deck looks untouched). Every entry into 'connected' — first
// pair *and* every reconnect — is celebrated by a green flash held for
// PAIRED_HOLD_MS, then fading to invisible over PAIRED_FADE_MS. Disconnect /
// reconnecting / failed states stay sticky-visible until they resolve.
const PAIRED_HOLD_MS = 2500;
const PAIRED_FADE_MS = 600;

export class StatusBadge {
  private root: HTMLDivElement;
  private textEl: HTMLSpanElement;
  private flashTimers: ReturnType<typeof setTimeout>[] = [];

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
    if (state === 'connected') {
      this.flashPaired();
    } else {
      this.cancelFlash();
    }
  }

  private cancelFlash(): void {
    for (const t of this.flashTimers) clearTimeout(t);
    this.flashTimers = [];
    delete this.root.dataset.flash;
  }

  private flashPaired(): void {
    this.cancelFlash();
    this.root.dataset.flash = 'visible';
    this.flashTimers.push(
      setTimeout(() => {
        this.root.dataset.flash = 'fading';
        this.flashTimers.push(
          setTimeout(() => {
            this.root.dataset.flash = 'hidden';
          }, PAIRED_FADE_MS),
        );
      }, PAIRED_HOLD_MS),
    );
  }
}
