import {
  PAIR_ALPHABET,
  PAIR_PART_LEN,
  type Role,
  type RoomCreateResponse,
} from '@slide-remote/protocol';

export { RoomDO } from './room';

interface Env {
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace;
  MINT_RATE_LIMITER: RateLimit;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function genCode(): string {
  const a = new Uint8Array(PAIR_PART_LEN);
  crypto.getRandomValues(a);
  // 256 / 32 = 8 — every alphabet position is hit by exactly 8 byte values,
  // so `b % 32` is unbiased.
  let s = '';
  for (const b of a) s += PAIR_ALPHABET[b % PAIR_ALPHABET.length];
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
      // `cf-connecting-ip` is set by Cloudflare's edge; in local `wrangler dev`
      // it's absent, so we fall back to a constant key (every request shares
      // the bucket — fine for tests, never reached in prod).
      const ip = request.headers.get('cf-connecting-ip') ?? 'local';
      const { success } = await env.MINT_RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response('rate limited', { status: 429, headers: CORS_HEADERS });
      }
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
