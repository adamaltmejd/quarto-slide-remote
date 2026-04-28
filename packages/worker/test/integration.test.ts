// End-to-end integration test: boots `wrangler dev` against the worker, then
// exercises room creation, presenter↔viewer WebSocket plumbing, role/token
// enforcement, and snapshot replay for late-joining viewers.
//
// Run as part of `bun test` like any other. It is skipped when the runtime
// can't spawn wrangler (e.g. wrangler isn't installed). Set
// SR_BASE=http://host:port to skip auto-boot and target an existing instance.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ChildProcess, spawn } from 'node:child_process';

interface RoomBody {
  roomId: string;
  presenterToken: string;
  pairCode: string;
  joinUrl: string;
}

const externalBase = process.env.SR_BASE;
let base = externalBase ?? '';
let wrangler: ChildProcess | undefined;

const HTTP_PORT = 8809;

async function waitForPort(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready
    }
    await Bun.sleep(200);
  }
  throw new Error(`wrangler dev did not become ready at ${url}`);
}

const enabled = !!process.env.SR_INTEGRATION;

// Send a raw WebSocket upgrade handshake over TCP and return the HTTP status
// line. Used to probe auth rejection: bun's `WebSocket` polyfill emits the
// underlying EventEmitter 'error' event without a listener when the upgrade
// is refused (oven-sh/bun#11706, #5951), which bun:test surfaces as an
// unhandled error. A raw socket sidesteps the polyfill entirely.
async function probeUpgradeStatus(host: string, port: number, path: string): Promise<number> {
  const request = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Version: 13',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    '',
    '',
  ].join('\r\n');

  let buf = '';
  const status = new Promise<number>((resolve, reject) => {
    Bun.connect({
      hostname: host,
      port,
      socket: {
        open(socket) {
          socket.write(request);
        },
        data(socket, data) {
          buf += new TextDecoder().decode(data);
          const m = buf.match(/^HTTP\/1\.1 (\d{3})/);
          if (m) {
            socket.end();
            resolve(Number.parseInt(m[1] ?? '', 10));
          }
        },
        error(_socket, err) {
          reject(err);
        },
        close() {
          if (!buf) reject(new Error('socket closed before status line'));
        },
      },
    }).catch(reject);
  });
  return status;
}

async function mintRoom(): Promise<RoomBody> {
  const res = await fetch(`${base}/api/room/new`, { method: 'POST' });
  if (!res.ok) throw new Error(`mintRoom failed: ${res.status}`);
  return (await res.json()) as RoomBody;
}

interface Inbox {
  ws: WebSocket;
  msgs: unknown[];
  ready: Promise<void>;
  closed: Promise<number>;
}

function open(role: 'presenter' | 'viewer', room: RoomBody, token = room.presenterToken): Inbox {
  const url = new URL(`${base.replace(/^http/, 'ws')}/api/ws`);
  url.searchParams.set('room', room.roomId);
  url.searchParams.set('role', role);
  url.searchParams.set('token', token);
  const ws = new WebSocket(url.toString());
  const msgs: unknown[] = [];
  ws.onmessage = (e) => {
    // The DO only ever sends string frames. If something binary slips
    // through, JSON.parse('') throws and the test fails loudly rather
    // than silently swallowing the message — which is what we want.
    msgs.push(JSON.parse(typeof e.data === 'string' ? e.data : ''));
  };
  // Always attach error/close listeners so an auth-rejected upgrade never
  // surfaces as an unhandled error event in the test runner.
  let resolveReady: (v: void | PromiseLike<void>) => void = () => {};
  let rejectReady: (err: Error) => void = () => {};
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  const closed = new Promise<number>((resolve) => {
    ws.onclose = (e) => {
      rejectReady(new Error(`${role} ws closed before open: ${e.code}`));
      resolve(e.code);
    };
  });
  ws.onerror = () => rejectReady(new Error(`${role} ws error`));
  ws.onopen = () => resolveReady();
  return { ws, msgs, ready, closed };
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
    await Bun.sleep(25);
  }
  throw new Error(`timed out; inbox=${JSON.stringify(inbox.msgs)}`);
}

const isSnapshot = (m: unknown): m is { t: 'state_snapshot'; payload: { title?: string } } =>
  typeof m === 'object' && m !== null && (m as { t?: string }).t === 'state_snapshot';
const isCmd = (m: unknown): m is { t: 'cmd'; cmd: string } =>
  typeof m === 'object' && m !== null && (m as { t?: string }).t === 'cmd';
const isError = (m: unknown): m is { t: 'error'; code: string } =>
  typeof m === 'object' && m !== null && (m as { t?: string }).t === 'error';

// Skipped by default — boots wrangler dev (slow). Run with:
//   SR_INTEGRATION=1 bun test packages/worker
// Or use the `test:smoke` package script.
describe.skipIf(!enabled)('worker integration', () => {
  beforeAll(async () => {
    if (externalBase) return;
    base = `http://127.0.0.1:${HTTP_PORT}`;
    wrangler = spawn(
      'bunx',
      ['wrangler', 'dev', '--port', String(HTTP_PORT), '--ip', '127.0.0.1'],
      {
        cwd: new URL('..', import.meta.url).pathname,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      },
    );
    await waitForPort(`${base}/api/room/new`, 30_000);
  });

  afterAll(() => {
    wrangler?.kill('SIGINT');
  });

  test('mints a room and connects presenter+viewer', async () => {
    const room = await mintRoom();
    expect(room.roomId).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(room.presenterToken).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(room.pairCode).toBe(`${room.roomId}-${room.presenterToken}`);

    const presenter = open('presenter', room);
    const viewer = open('viewer', room);
    await Promise.all([presenter.ready, viewer.ready]);

    presenter.ws.send(
      JSON.stringify({
        t: 'state',
        payload: { roomId: room.roomId, h: 1, v: 0, total: 10, title: 'Hello', ts: Date.now() },
      }),
    );
    const snap = await waitFor(viewer, isSnapshot);
    expect(snap.payload.title).toBe('Hello');

    presenter.ws.close();
    viewer.ws.close();
  });

  test('viewer command is forwarded to presenter', async () => {
    const room = await mintRoom();
    const presenter = open('presenter', room);
    const viewer = open('viewer', room);
    await Promise.all([presenter.ready, viewer.ready]);

    viewer.ws.send(JSON.stringify({ t: 'cmd', cmd: 'next' }));
    const cmd = await waitFor(presenter, isCmd);
    expect(cmd.cmd).toBe('next');

    presenter.ws.close();
    viewer.ws.close();
  });

  test('viewer cannot send state messages', async () => {
    const room = await mintRoom();
    const viewer = open('viewer', room);
    await viewer.ready;
    viewer.ws.send(
      JSON.stringify({
        t: 'state',
        payload: { roomId: room.roomId, h: 0, v: 0, total: 1, ts: Date.now() },
      }),
    );
    const err = await waitFor(viewer, isError);
    expect(err.code).toBeTruthy();
    viewer.ws.close();
  });

  test('presenter upgrade is rejected with 401 on bad token', async () => {
    const room = await mintRoom();
    const path = `/api/ws?room=${room.roomId}&role=presenter&token=wrong`;
    const status = await probeUpgradeStatus('127.0.0.1', HTTP_PORT, path);
    expect(status).toBe(401);
  });

  test('presenter upgrade succeeds (101) with the right token', async () => {
    const room = await mintRoom();
    const path = `/api/ws?room=${room.roomId}&role=presenter&token=${room.presenterToken}`;
    const status = await probeUpgradeStatus('127.0.0.1', HTTP_PORT, path);
    expect(status).toBe(101);
  });

  test('late viewer receives snapshot from DO storage', async () => {
    const room = await mintRoom();
    const presenter = open('presenter', room);
    await presenter.ready;
    presenter.ws.send(
      JSON.stringify({
        t: 'state',
        payload: {
          roomId: room.roomId,
          h: 2,
          v: 0,
          total: 5,
          title: 'Persisted',
          ts: Date.now(),
        },
      }),
    );
    // Give the DO time to flush before the late viewer arrives.
    await Bun.sleep(100);

    const late = open('viewer', room);
    await late.ready;
    const snap = await waitFor(late, isSnapshot);
    expect(snap.payload.title).toBe('Persisted');

    presenter.ws.close();
    late.ws.close();
  });
});
