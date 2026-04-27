// WebSocket client for the deck side. Mints a room, opens the WS as
// presenter, pumps state on Reveal events, applies incoming commands.

import type {
  ClientMessage,
  Command,
  RoomCreateResponse,
  ServerMessage,
} from '@slide-remote/protocol';
import { extractState } from './extract';
import type { RevealApi } from './types';

const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000] as const;

export type ClientStatus =
  | 'minting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface ClientHandlers {
  onConnected(joinUrl: string, roomId: string): void;
  onStatus(status: ClientStatus): void;
  onPeerCount(presenter: number, viewer: number): void;
  onError(msg: string): void;
}

export class Client {
  private ws?: WebSocket;
  private room?: RoomCreateResponse;
  private reconnectAttempt = 0;
  private flushTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private workerUrl: string,
    private reveal: RevealApi,
    private handlers: ClientHandlers,
  ) {}

  getRoom(): RoomCreateResponse | undefined {
    return this.room;
  }

  async start(): Promise<void> {
    this.handlers.onStatus('minting');
    try {
      const res = await fetch(new URL('/api/room/new', this.workerUrl).toString(), {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`mint room: ${res.status}`);
      this.room = (await res.json()) as RoomCreateResponse;
    } catch (e) {
      this.handlers.onError(`could not mint room: ${(e as Error).message}`);
      this.handlers.onStatus('failed');
      return;
    }
    this.handlers.onConnected(this.room.joinUrl, this.room.roomId);
    this.openSocket();
    this.attachRevealHooks();
  }

  private openSocket(): void {
    if (!this.room) return;
    const url = new URL('/api/ws', this.workerUrl);
    url.protocol = url.protocol.replace(/^http/, 'ws');
    url.searchParams.set('room', this.room.roomId);
    url.searchParams.set('role', 'presenter');
    url.searchParams.set('token', this.room.presenterToken);

    this.handlers.onStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.handlers.onStatus('connected');
      // Push current state so a freshly reconnected viewer sees the right slide.
      this.pumpStateNow();
    });

    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') return;
      try {
        this.handleServerMessage(JSON.parse(e.data) as ServerMessage);
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener('close', () => {
      this.handlers.onStatus('disconnected');
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // close handler will fire next; nothing to do here.
    });
  }

  private scheduleReconnect(): void {
    const idx = Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1);
    const delay = RECONNECT_BACKOFF_MS[idx] ?? 15000;
    this.reconnectAttempt++;
    setTimeout(() => this.openSocket(), delay);
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'cmd':
        this.applyCommand(msg.cmd, msg.args);
        break;
      case 'peer':
        this.handlers.onPeerCount(msg.presenter, msg.viewer);
        break;
      case 'error':
        this.handlers.onError(`${msg.code}: ${msg.msg}`);
        break;
      case 'state_snapshot':
        // Presenter ignores its own snapshots; nothing to do.
        break;
    }
  }

  private applyCommand(cmd: Command, args: unknown): void {
    switch (cmd) {
      case 'next':
        this.reveal.next();
        break;
      case 'prev':
        this.reveal.prev();
        break;
      case 'goto': {
        const a = (args ?? {}) as { h?: number; v?: number; f?: number };
        if (typeof a.h === 'number') this.reveal.slide(a.h, a.v ?? 0, a.f);
        break;
      }
      case 'black':
        this.reveal.togglePause();
        break;
    }
  }

  private attachRevealHooks(): void {
    const events = [
      'ready',
      'slidechanged',
      'fragmentshown',
      'fragmenthidden',
      'paused',
      'resumed',
      'overviewshown',
      'overviewhidden',
    ];
    for (const ev of events) this.reveal.on(ev, () => this.pumpStateSoon());
  }

  private pumpStateSoon(): void {
    // Coalesce rapid Reveal events into a single state push.
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.pumpStateNow();
    }, 30);
  }

  private pumpStateNow(): void {
    if (!this.room) return;
    const state = extractState(this.reveal, this.room.roomId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { t: 'state', payload: state };
      this.ws.send(JSON.stringify(msg));
    }
  }
}
