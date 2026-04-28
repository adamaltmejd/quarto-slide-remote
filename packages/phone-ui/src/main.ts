import type { Command } from '@slide-remote/protocol';
import { buildLanding } from './landing';
import { buildFatal, buildUi } from './render';
import { clearSession, loadSession, saveSession } from './session';
import { attachEdgeSwipe } from './swipe';
import { WakeLockManager } from './wake-lock';
import { ViewerClient, type ViewerStatus } from './ws';

const STATUS_TEXT = {
  connecting: 'connecting…',
  connected: 'paired',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
  failed: 'failed',
} as const;

const REPAIR_TEXT = 'Re-pair: scan a fresh QR code from the deck.';

function parseRoomId(): string | null {
  const m = /^\/r\/([^/]+)/.exec(window.location.pathname);
  return m?.[1] ?? null;
}

function parseToken(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  return new URLSearchParams(hash).get('t');
}

function fatal(text: string): void {
  document.body.replaceChildren(buildFatal(text));
}

const roomId = parseRoomId();
if (!roomId) {
  // Bare URL — show the manual-entry form. The form parses pasted join
  // links or typed pair codes (e.g. R12V-P138) and navigates to the
  // /r/{roomId}#t={token} URL, which re-runs this entry script.
  document.body.replaceChildren(buildLanding());
  // Halt the rest of main — there's nothing to do without a room.
  throw new Error('landing');
}

const tokenFromUrl = parseToken();
const token = tokenFromUrl ?? loadSession(roomId)?.token ?? null;
if (!token) {
  fatal('Missing pairing token. Re-scan the QR code from the deck.');
  throw new Error('no token');
}

if (tokenFromUrl) {
  saveSession({ roomId, token });
  // Hide the token from browser history once we've captured it.
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

const wakeLock = new WakeLockManager();

// Buzz only when the WS actually accepted the message — an offline tap
// shouldn't fake-confirm. Android-only in practice; iOS Safari leaves
// navigator.vibrate undefined and the optional call no-ops.
function send(cmd: Command): void {
  if (client.send(cmd)) navigator.vibrate?.(10);
}

const ui = buildUi({
  onPrev: () => send('prev'),
  onNext: () => send('next'),
  onPause: () => send('black'),
  onResetTimer: () => send('resetTimer'),
  onRepair: () => {
    client.stop();
    void wakeLock.release();
    clearSession();
    ui.showFatal(REPAIR_TEXT);
  },
});
document.body.replaceChildren(ui.root);

// Photo-app-style edge swipes: right edge inward → next, left edge inward → prev.
// Attached to body so the recognizer sees pointerdowns even when they land on
// the notes pane (which scrolls vertically — the gesture self-disqualifies on
// vertical movement, so scrolling still works).
attachEdgeSwipe(document.body, {
  onPrev: () => send('prev'),
  onNext: () => send('next'),
});

// Track previous status so we can surface transitions (rather than absolute
// state) via the toast — the persistent dot already covers absolute state.
let prevStatus: ViewerStatus = 'connecting';

const client = new ViewerClient(window.location.origin, roomId, token, {
  onStatus: (state) => {
    ui.setStatus(STATUS_TEXT[state], state);
    if (state === 'connected') {
      void wakeLock.acquire();
      // Only celebrate a *re*-connect, not the initial pair.
      if (prevStatus === 'reconnecting' || prevStatus === 'disconnected') {
        ui.showToast('reconnected', { tone: 'good' });
      } else {
        ui.hideToast();
      }
    } else if (state === 'reconnecting' || state === 'disconnected') {
      // Don't toast on the initial 'connecting' → first connect handshake.
      if (prevStatus !== 'connecting') {
        ui.showToast('connection lost — reconnecting…', { tone: 'warn', sticky: true });
      }
    } else if (state === 'failed') {
      void wakeLock.release();
      ui.showToast("couldn't reconnect — re-pair or refresh", {
        tone: 'bad',
        sticky: true,
      });
    }
    prevStatus = state;
  },
  onSnapshot: (msg) => ui.setState(msg.payload),
  onPeer: (presenter, viewer) => ui.setPeerCount(presenter, viewer),
  onError: (code, msg) => ui.showError(`${code}: ${msg}`),
});

client.start();
