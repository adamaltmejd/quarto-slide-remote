// Slide-Remote deck plugin entry. Silent until the presenter activates via
// `?remote=1`, Shift+R, or an opt-in corner button.

import { Client, type ClientStatus } from './client';
import { type PluginConfig, readConfig, shouldDisable } from './config';
import { Overlay, StatusBadge } from './overlay';
import type { RevealApi, RevealPlugin } from './types';

// Capture this script's directory so the lazy QR chunk can be fetched
// from the same _extensions/slide-remote/ directory as the main bundle.
// `document.currentScript` is set while the IIFE is first executing; falls
// back to the document base URL if the plugin is loaded as a module (which
// we don't currently support, but the fallback keeps the loader sane).
const PLUGIN_BASE = ((): string => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.src) return new URL('.', script.src).toString();
  return new URL('.', document.baseURI).toString();
})();

// Overlay status surfaces the *pairing* lifecycle, not the deck-side WS
// health: a deck WS in 'connected' state has only reached the worker,
// not been paired with a remote. The controller upgrades this to 'paired'
// once peer count reports a remote attached. "Remote" rather than "phone"
// because the laptop-as-remote landing form makes a non-phone pairing a
// supported path.
const OVERLAY_STATUS_TEXT: Record<ClientStatus, string> = {
  minting: 'minting room…',
  connecting: 'connecting…',
  connected: 'waiting for remote…',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
  failed: 'failed',
};

// Badge status reflects the deck-side WS health (it's only attached after
// `connected`, then governs the green flash and the sticky red on
// disconnect/reconnecting/failed).
const BADGE_STATUS_TEXT: Record<ClientStatus, string> = {
  minting: 'minting room…',
  connecting: 'connecting…',
  connected: 'paired',
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
  // Track WS status and remote-attached count so we can compute the overlay
  // status from both signals (vs. the older code which only reflected WS
  // status — leaving "waiting for remote…" stale after a remote paired).
  private status: ClientStatus = 'minting';
  private remotes = 0;

  constructor(
    private cfg: PluginConfig,
    private reveal: RevealApi,
  ) {}

  // Called by every activation trigger (?remote=1, Shift+R, button click).
  // First call mints a room and connects; later calls just re-open the overlay
  // so the presenter can rescan with another remote or recover after dismissing.
  // shouldDisable() already guarantees a non-empty workerUrl.
  activate(): void {
    if (this.client) {
      const room = this.client.getRoom();
      if (room) {
        this.overlay?.open(room.joinUrl, room.pairCode);
        // Re-open after a previous pair: surface the current state rather
        // than whatever text was set before close().
        this.overlay?.setStatus(this.overlayStatus());
      }
      return;
    }
    this.overlay = new Overlay(PLUGIN_BASE, { onClose: () => this.overlay?.close() });
    this.badge = new StatusBadge();
    this.client = new Client(this.cfg.workerUrl, this.reveal, {
      onConnected: (joinUrl, roomId, pairCode) => {
        this.overlay?.open(joinUrl, pairCode);
        this.badge?.attach();
        this.badge?.setState('connected', `room ${roomId}`);
      },
      onStatus: (status) => {
        this.status = status;
        this.overlay?.setStatus(this.overlayStatus());
        this.badge?.setState(BADGE_STATE[status], BADGE_STATUS_TEXT[status]);
      },
      onPeerCount: (_presenter, viewer) => {
        this.remotes = viewer;
        this.overlay?.setStatus(this.overlayStatus());
        // Auto-dismiss the pairing overlay once a remote attaches.
        if (viewer > 0) this.overlay?.close();
      },
      onError: (msg) => console.error('[slide-remote]', msg),
    });
    void this.client.start();
  }

  private overlayStatus(): string {
    if (this.remotes > 0 && this.status === 'connected') return 'paired';
    return OVERLAY_STATUS_TEXT[this.status];
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
          // Skip while the user is typing into an editable element. `e.target`
          // is `EventTarget`, which can be `Document` (no `.matches`); guard
          // with `instanceof Element` rather than blindly casting.
          const target = e.target;
          if (
            target instanceof Element &&
            target.matches('input, textarea, [contenteditable="true"]')
          ) {
            return;
          }
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
