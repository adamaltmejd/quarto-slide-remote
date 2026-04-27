// End-to-end smoke test for Phase 1: spin up presenter + viewer over WebSockets,
// exchange state and a command, print pass/fail.
//
// Assumes wrangler dev is already running on localhost:8787.

const BASE = process.env['SR_BASE'] ?? 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');

interface RoomBody {
  roomId: string;
  presenterToken: string;
  joinUrl: string;
}

async function mintRoom(): Promise<RoomBody> {
  const res = await fetch(`${BASE}/api/room/new`, { method: 'POST' });
  if (!res.ok) throw new Error(`mintRoom failed: ${res.status}`);
  return (await res.json()) as RoomBody;
}

interface Inbox {
  ws: WebSocket;
  msgs: unknown[];
  ready: Promise<void>;
}

function open(role: 'presenter' | 'viewer', room: RoomBody): Inbox {
  const url = new URL(`${WS_BASE}/api/ws`);
  url.searchParams.set('room', room.roomId);
  url.searchParams.set('role', role);
  url.searchParams.set('token', room.presenterToken);
  const ws = new WebSocket(url.toString());
  const msgs: unknown[] = [];
  ws.addEventListener('message', (e) => {
    msgs.push(JSON.parse(typeof e.data === 'string' ? e.data : ''));
  });
  const ready = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error(`${role} ws error`)));
  });
  return { ws, msgs, ready };
}

async function waitFor<T>(
  inbox: Inbox,
  predicate: (m: unknown) => m is T,
  timeoutMs = 2000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = 0; i < inbox.msgs.length; i++) {
      const m = inbox.msgs[i];
      if (predicate(m)) {
        inbox.msgs.splice(i, 1);
        return m;
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting; inbox=${JSON.stringify(inbox.msgs)}`);
}

const room = await mintRoom();
console.log(`room: ${room.roomId}`);

const presenter = open('presenter', room);
const viewer = open('viewer', room);
await Promise.all([presenter.ready, viewer.ready]);
console.log('both connected');

// Presenter publishes state. Viewer should receive it as a snapshot.
presenter.ws.send(
  JSON.stringify({
    t: 'state',
    payload: {
      roomId: room.roomId,
      h: 1,
      v: 0,
      f: 0,
      total: 10,
      title: 'Test Slide',
      ts: Date.now(),
    },
  }),
);

const snap = await waitFor(
  viewer,
  (m): m is { t: 'state_snapshot'; payload: { title: string } } =>
    typeof m === 'object' && m !== null && (m as { t?: string }).t === 'state_snapshot',
);
console.log(`viewer received state_snapshot: ${snap.payload.title}`);

// Viewer issues a command. Presenter should receive it.
viewer.ws.send(JSON.stringify({ t: 'cmd', cmd: 'next' }));

const cmd = await waitFor(
  presenter,
  (m): m is { t: 'cmd'; cmd: string } =>
    typeof m === 'object' && m !== null && (m as { t?: string }).t === 'cmd',
);
console.log(`presenter received cmd: ${cmd.cmd}`);

// Negative: viewer attempts to send `state` (presenter-only). Should get an error.
viewer.ws.send(
  JSON.stringify({
    t: 'state',
    payload: { roomId: room.roomId, h: 0, v: 0, total: 1, ts: Date.now() },
  }),
);
const err = await waitFor(
  viewer,
  (m): m is { t: 'error'; code: string } =>
    typeof m === 'object' && m !== null && (m as { t?: string }).t === 'error',
);
console.log(`viewer got expected error: ${err.code}`);

// Negative: presenter without a valid token. Connection should be rejected.
const badUrl = new URL(`${WS_BASE}/api/ws`);
badUrl.searchParams.set('room', room.roomId);
badUrl.searchParams.set('role', 'presenter');
badUrl.searchParams.set('token', 'wrong');
const bad = new WebSocket(badUrl.toString());
const badResult = await new Promise<string>((resolve) => {
  bad.addEventListener('open', () => resolve('opened (BAD)'));
  bad.addEventListener('error', () => resolve('rejected (good)'));
  bad.addEventListener('close', () => resolve('closed (good)'));
});
console.log(`bad-token presenter: ${badResult}`);

// Late viewer joins after the snapshot has been written. They should receive
// the latest state immediately (from DO storage, not racing with the presenter).
const lateViewer = open('viewer', room);
await lateViewer.ready;
const lateSnap = await waitFor(
  lateViewer,
  (m): m is { t: 'state_snapshot'; payload: { title: string } } =>
    typeof m === 'object' && m !== null && (m as { t?: string }).t === 'state_snapshot',
);
console.log(`late viewer received snapshot on connect: ${lateSnap.payload.title}`);

presenter.ws.close();
viewer.ws.close();
lateViewer.ws.close();
console.log('PASS');
