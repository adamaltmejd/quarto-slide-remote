// Slide-Remote deck plugin entry. Silent until the presenter activates via
// `?remote=1`, Shift+R, or an opt-in corner button.

import { Client, type ClientStatus } from './client';
import { type PluginConfig, readConfig, shouldDisable } from './config';
import { Overlay, StatusBadge } from './overlay';
import type { RevealApi, RevealPlugin } from './types';

const STATUS_TEXT: Record<ClientStatus, string> = {
  minting: 'minting room…',
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
  failed: 'failed',
};

const BADGE_STATE: Record<ClientStatus, 'connected' | 'reconnecting' | 'disconnected'> = {
  minting: 'reconnecting',
  connecting: 'reconnecting',
  connected: 'connected',
  reconnecting: 'reconnecting',
  disconnected: 'disconnected',
  failed: 'disconnected',
};

class SlideRemoteController {
  private overlay?: Overlay;
  private badge?: StatusBadge;
  private client?: Client;

  constructor(
    private cfg: PluginConfig,
    private reveal: RevealApi,
  ) {}

  // Called by every activation trigger (?remote=1, Shift+R, button click).
  // First call mints a room and connects; later calls just re-open the overlay
  // so the presenter can rescan with another phone or recover after dismissing.
  // shouldDisable() already guarantees a non-empty workerUrl.
  activate(): void {
    if (this.client) {
      const room = this.client.getRoom();
      if (room) this.overlay?.open(room.joinUrl, room.roomId);
      return;
    }
    this.overlay = new Overlay({ onClose: () => this.overlay?.close() });
    this.badge = new StatusBadge();
    this.client = new Client(this.cfg.workerUrl, this.reveal, {
      onConnected: (joinUrl, roomId) => {
        this.overlay?.open(joinUrl, roomId);
        this.badge?.attach();
        this.badge?.setState('connected', `room ${roomId.slice(0, 6)}`);
      },
      onStatus: (status) => {
        this.overlay?.setStatus(STATUS_TEXT[status]);
        const badgeText = status === 'connected' ? 'paired' : STATUS_TEXT[status];
        this.badge?.setState(BADGE_STATE[status], badgeText);
      },
      onPeerCount: (_presenter, viewer) => {
        this.overlay?.setPeerCount(viewer);
        if (viewer > 0) this.overlay?.close();
      },
      onError: (msg) => console.error('[slide-remote]', msg),
    });
    void this.client.start();
  }
}

function plugin(): RevealPlugin {
  return {
    id: 'slide-remote',
    init(reveal: RevealApi): void {
      const cfg = readConfig();
      if (shouldDisable(cfg)) return;

      const controller = new SlideRemoteController(cfg, reveal);
      const params = new URLSearchParams(window.location.search);
      if (params.has('remote')) {
        // Activate after Reveal is ready so getCurrentSlide() etc. are valid.
        reveal.on('ready', () => controller.activate());
      }
      // Shift+R to summon the pairing overlay mid-deck.
      document.addEventListener('keydown', (e) => {
        if (
          e.shiftKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          (e.key === 'R' || e.key === 'r')
        ) {
          const target = e.target as HTMLElement | null;
          if (target?.matches('input, textarea, [contenteditable="true"]')) return;
          e.preventDefault();
          controller.activate();
        }
      });
      if (cfg.showButton) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sr-trigger';
        btn.setAttribute('aria-label', 'Pair phone (Slide-Remote)');
        btn.textContent = '📱';
        btn.addEventListener('click', () => controller.activate());
        document.body.appendChild(btn);
      }
    },
  };
}

declare global {
  interface Window {
    SlideRemote: () => RevealPlugin;
  }
}

window.SlideRemote = plugin;
