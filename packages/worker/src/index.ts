import type { Role, RoomCreateResponse } from '@slide-remote/protocol';

export { RoomDO } from './room';

interface Env {
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Canonical Crockford-32 (omits I, L, O, U from letters; all digits kept)
// so codes are typeable and unambiguous when read off a slide. 4 chars ≈
// 20 bits per part — fine paired with rate-limits at the edge; the rooms+
// tokens are ephemeral and minted per talk.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function genCode(): string {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  // 256 / 32 = 8 — every alphabet position is hit by exactly 8 byte values,
  // so `b % 32` is unbiased.
  let s = '';
  for (const b of a) s += ALPHABET[b % 32];
  return s;
}

// Cap the mint-retry loop so a saturated keyspace returns 503 rather than
// looping forever. 32^4 ≈ 1M codes — at realistic concurrency this loop
// terminates on the first try ~99.99% of the time.
const MAX_MINT_TRIES = 10;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/room/new' && request.method === 'POST') {
      const presenterToken = genCode();
      let roomId = '';
      let ok = false;
      for (let i = 0; i < MAX_MINT_TRIES; i++) {
        roomId = genCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
        const initRes = await stub.fetch(
          new Request(`https://room/init?token=${presenterToken}`, { method: 'POST' }),
        );
        if (initRes.status === 409) continue; // room ID already in use, retry
        if (initRes.ok) {
          ok = true;
          break;
        }
        return new Response('failed to init room', { status: 500, headers: CORS_HEADERS });
      }
      if (!ok) {
        return new Response('room keyspace exhausted', { status: 503, headers: CORS_HEADERS });
      }
      const body: RoomCreateResponse = {
        roomId,
        presenterToken,
        pairCode: `${roomId}-${presenterToken}`,
        joinUrl: new URL(`/r/${roomId}#t=${presenterToken}`, url.origin).toString(),
      };
      return Response.json(body, { headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/ws') {
      const roomId = url.searchParams.get('room');
      const role = url.searchParams.get('role') as Role | null;
      if (!roomId || (role !== 'presenter' && role !== 'viewer')) {
        return new Response('bad request', { status: 400 });
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      return stub.fetch(request);
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response('not found', { status: 404 });
    }

    // /r/:roomId and everything else: phone UI bundle.
    return env.ASSETS.fetch(request);
  },
};
