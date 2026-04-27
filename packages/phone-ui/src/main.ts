// Phone UI entry. Pulls roomId from /r/:roomId, token from URL hash, then
// connects to the worker as a viewer and wires the controls to commands.

import { buildUi } from './render';
import { loadSession, saveSession } from './session';
import { ViewerClient } from './ws';

function parseRoomId(): string | null {
  const m = /^\/r\/([^/]+)/.exec(window.location.pathname);
  return m?.[1] ?? null;
}

function parseToken(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get('t');
}

function fatal(text: string): void {
  document.body.innerHTML = `<main class="sr-fatal"><h1>slide-remote</h1><p>${text}</p></main>`;
}

const roomId = parseRoomId();
if (!roomId) {
  fatal('Missing room ID. Open the link from the deck QR code.');
  throw new Error('no room id');
}

let token = parseToken();
if (!token) {
  const stored = loadSession(roomId);
  if (stored) token = stored.token;
}
if (!token) {
  fatal('Missing pairing token. Re-scan the QR code from the deck.');
  throw new Error('no token');
}

saveSession({ roomId, token, lastSeen: Date.now() });

// Hide the token from browser history once we've captured it.
if (window.location.hash) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

const ui = buildUi({
  onPrev: () => client.send('prev'),
  onNext: () => client.send('next'),
});
document.body.replaceChildren(ui.root);
ui.setRoom(roomId);

const client = new ViewerClient(window.location.origin, roomId, token, {
  onStatus: (state) => {
    const text = {
      connecting: 'connecting…',
      connected: 'paired',
      reconnecting: 'reconnecting…',
      disconnected: 'disconnected',
      error: 'error',
    }[state];
    ui.setStatus(text, state);
  },
  onSnapshot: (msg) => {
    ui.setState(msg.payload);
  },
  onPeer: (presenter, viewer) => ui.setPeerCount(presenter, viewer),
  onError: (code, msg) => {
    ui.showError(`${code}: ${msg}`);
  },
});

client.start();
