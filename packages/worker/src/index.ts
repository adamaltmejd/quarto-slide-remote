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

// Random id, hex-encoded. 5 bytes ≈ 40 bits, plenty for a per-talk room.
function genId(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/room/new' && request.method === 'POST') {
      const roomId = genId(5);
      const presenterToken = genId(16);
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      const initRes = await stub.fetch(
        new Request(`https://room/init?token=${presenterToken}`, { method: 'POST' }),
      );
      if (!initRes.ok) {
        return new Response('failed to init room', { status: 500, headers: CORS_HEADERS });
      }
      const body: RoomCreateResponse = {
        roomId,
        presenterToken,
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
