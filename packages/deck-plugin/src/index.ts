// Slide-Remote deck plugin entry. Silent until the presenter activates via
// `?remote=1`, Shift+R, or an opt-in corner button.

import { Client } from './client';
import { type PluginConfig, readConfig, shouldDisable } from './config';
import { Overlay, StatusBadge } from './overlay';
import type { RevealApi, RevealPlugin } from './types';

class SlideRemoteController {
  private overlay?: Overlay;
  private badge?: StatusBadge;
  private client?: Client;
  private lastJoinUrl?: string;
  private lastRoomId?: string;

  constructor(
    private cfg: PluginConfig,
    private reveal: RevealApi,
  ) {}

  // Called by every activation trigger (?remote=1, Shift+R, button click).
  // First call mints a room and connects; later calls just re-open the overlay
  // so the presenter can rescan with another phone or recover after dismissing.
  activate(): void {
    if (this.client) {
      if (this.lastJoinUrl && this.lastRoomId) {
        this.overlay?.open(this.lastJoinUrl, this.lastRoomId);
      }
      return;
    }
    if (!this.cfg.workerUrl) {
      console.error('[slide-remote] missing slide-remote.worker-url in YAML');
      return;
    }
    this.overlay = new Overlay({ onClose: () => this.overlay?.close() });
    this.badge = new StatusBadge();
    this.client = new Client(this.cfg.workerUrl, this.reveal, {
      onConnected: (joinUrl, roomId) => {
        this.lastJoinUrl = joinUrl;
        this.lastRoomId = roomId;
        this.overlay?.open(joinUrl, roomId);
        this.badge?.attach();
        this.badge?.setState('connected', `room ${roomId.slice(0, 6)}`);
      },
      onStatus: (text) => {
        this.overlay?.setStatus(text);
        if (text === 'connected') this.badge?.setState('connected', 'paired');
        else if (text === 'disconnected') this.badge?.setState('disconnected', 'offline');
        else this.badge?.setState('reconnecting', text);
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
        if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'R' || e.key === 'r')) {
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
