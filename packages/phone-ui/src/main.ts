import { buildFatal, buildUi } from './render';
import { clearSession, loadSession, saveSession } from './session';
import { WakeLockManager } from './wake-lock';
import { ViewerClient, type ViewerStatus } from './ws';

const STATUS_TEXT = {
  connecting: 'connecting…',
  connected: 'paired',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
  failed: 'failed',
  error: 'error',
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
  fatal('Missing room ID. Open the link from the deck QR code.');
  throw new Error('no room id');
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

const ui = buildUi({
  onPrev: () => client.send('prev'),
  onNext: () => client.send('next'),
  onPause: () => client.send('black'),
  onResetTimer: () => client.send('resetTimer'),
  onRepair: () => {
    client.stop();
    void wakeLock.release();
    clearSession();
    ui.showFatal(REPAIR_TEXT);
  },
});
document.body.replaceChildren(ui.root);
ui.setRoom(roomId);

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
