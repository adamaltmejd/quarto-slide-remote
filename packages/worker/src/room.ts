import type {
  ClientMessage,
  Command,
  Role,
  ServerMessage,
  SlideState,
} from '@slide-remote/protocol';

// One Durable Object per room. Mediates messages between the presenter
// (the deck) and viewers (phones). State held in DO storage so a hibernated
// DO wakes up with the latest snapshot.
export class RoomDO {
  private connections = new Map<WebSocket, Role>();
  private presenterToken?: string;

  constructor(
    private state: DurableObjectState,
    _env: unknown,
  ) {
    this.state.blockConcurrencyWhile(async () => {
      this.presenterToken = await this.state.storage.get<string>('presenterToken');
      // Restore role tags after hibernation.
      for (const ws of this.state.getWebSockets()) {
        const tags = this.state.getTags(ws);
        const role = tags.find((t) => t === 'presenter' || t === 'viewer') as Role | undefined;
        if (role) this.connections.set(ws, role);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init') {
      const token = url.searchParams.get('token');
      if (!token) return new Response('bad request', { status: 400 });
      this.presenterToken = token;
      await this.state.storage.put('presenterToken', token);
      return new Response('ok');
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const role = url.searchParams.get('role') as Role;
    const token = url.searchParams.get('token');

    // One room secret authenticates both presenter (deck) and viewer (phone).
    // The QR carries this token in the URL hash so it never hits server logs.
    if (!this.presenterToken || token !== this.presenterToken) {
      return new Response('unauthorized', { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]] as [WebSocket, WebSocket];

    this.state.acceptWebSocket(server, [role]);
    this.connections.set(server, role);

    if (role === 'viewer') {
      const snapshot = await this.state.storage.get<SlideState>('snapshot');
      if (snapshot) {
        this.send(server, {
          t: 'state_snapshot',
          payload: snapshot,
          serverTs: Date.now(),
        });
      }
    }
    this.broadcastPeer();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const role = this.connections.get(ws);
    if (!role) return;

    let msg: ClientMessage;
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      this.send(ws, { t: 'error', code: 'bad_json', msg: 'invalid JSON' });
      return;
    }

    if (msg.t === 'state' && role === 'presenter') {
      await this.state.storage.put('snapshot', msg.payload);
      const out: ServerMessage = {
        t: 'state_snapshot',
        payload: msg.payload,
        serverTs: Date.now(),
      };
      this.broadcast(out, 'viewer');
    } else if (msg.t === 'cmd' && role === 'viewer') {
      const out: ServerMessage = { t: 'cmd', cmd: msg.cmd as Command, args: msg.args };
      this.broadcast(out, 'presenter');
    } else {
      this.send(ws, {
        t: 'error',
        code: 'bad_role',
        msg: `${msg.t} not allowed for role ${role}`,
      });
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.dropConnection(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.dropConnection(ws);
  }

  private dropConnection(ws: WebSocket): void {
    this.connections.delete(ws);
    this.broadcastPeer();
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore — peer may have just closed.
    }
  }

  private broadcast(msg: ServerMessage, to: Role): void {
    for (const [conn, r] of this.connections) {
      if (r === to) this.send(conn, msg);
    }
  }

  private broadcastPeer(): void {
    let presenter = 0;
    let viewer = 0;
    for (const r of this.connections.values()) {
      if (r === 'presenter') presenter++;
      else viewer++;
    }
    const msg: ServerMessage = { t: 'peer', presenter, viewer };
    for (const ws of this.connections.keys()) this.send(ws, msg);
  }
}
