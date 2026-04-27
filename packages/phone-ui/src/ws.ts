// Phone-side WebSocket client. Connects as viewer, applies snapshots, sends
// commands, reconnects with exponential backoff.

import type { ClientMessage, Command, ServerMessage } from '@slide-remote/protocol';

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000] as const;
// Roughly 15 minutes of trying once the cap (15s) is hit. After that the
// phone shows 'failed' instead of spinning indefinitely.
const MAX_RECONNECT_ATTEMPTS = 60;

export type ViewerStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'
  | 'error';

export interface ClientHandlers {
  onStatus(text: ViewerStatus): void;
  onSnapshot(msg: Extract<ServerMessage, { t: 'state_snapshot' }>): void;
  onPeer(presenter: number, viewer: number): void;
  onError(code: string, msg: string): void;
}

export class ViewerClient {
  private ws?: WebSocket;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(
    private base: string,
    private roomId: string,
    private token: string,
    private handlers: ClientHandlers,
  ) {
    addEventListener('online', () => this.reconnectNow());
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }

  send(cmd: Command, args?: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    const msg: ClientMessage = { t: 'cmd', cmd, args };
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private connect(): void {
    const url = new URL('/api/ws', this.base);
    url.protocol = url.protocol.replace(/^http/, 'ws');
    url.searchParams.set('room', this.roomId);
    url.searchParams.set('role', 'viewer');
    url.searchParams.set('token', this.token);

    this.handlers.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
      this.handlers.onStatus('connected');
    });

    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') return;
      try {
        this.dispatch(JSON.parse(e.data) as ServerMessage);
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener('close', () => {
      if (this.closed) return;
      this.handlers.onStatus('disconnected');
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // close handler will fire next.
    });
  }

  private dispatch(msg: ServerMessage): void {
    switch (msg.t) {
      case 'state_snapshot':
        this.handlers.onSnapshot(msg);
        break;
      case 'peer':
        this.handlers.onPeer(msg.presenter, msg.viewer);
        break;
      case 'error':
        this.handlers.onError(msg.code, msg.msg);
        break;
      case 'cmd':
        // Viewer doesn't receive commands.
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.attempt >= MAX_RECONNECT_ATTEMPTS) {
      this.handlers.onStatus('failed');
      this.handlers.onError(
        'giveup',
        `giving up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`,
      );
      return;
    }
    const idx = Math.min(this.attempt, BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[idx] ?? 15000;
    this.attempt++;
    this.timer = setTimeout(() => this.connect(), delay);
  }

  private reconnectNow(): void {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.attempt = 0;
    this.connect();
  }
}
