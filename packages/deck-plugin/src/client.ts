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
// Roughly 15 minutes of trying once the cap (15s) is hit. After that the
// presenter sees 'failed' instead of an indefinitely-spinning badge.
const MAX_RECONNECT_ATTEMPTS = 60;

export type ClientStatus =
  | 'minting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

// Commands that have a direct Reveal-side effect. `resetTimer` is excluded
// because it only mutates Client instance state, and lives in handleServerMessage.
type RevealCommand = Exclude<Command, 'resetTimer'>;

// Pure command dispatch. Exported so tests can exercise it without standing
// up a WebSocket / fetch / mint flow.
export function applyRemoteCommand(reveal: RevealApi, cmd: RevealCommand, args: unknown): void {
  switch (cmd) {
    case 'next':
      reveal.next();
      break;
    case 'prev':
      reveal.prev();
      break;
    case 'goto': {
      const a = (args ?? {}) as { h?: number; v?: number; f?: number };
      if (typeof a.h === 'number') reveal.slide(a.h, a.v ?? 0, a.f);
      break;
    }
    case 'black':
      reveal.togglePause();
      break;
  }
}

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
  // Epoch ms when the deck first navigated, or after the most recent
  // resetTimer command. Undefined until the first user navigation.
  private startedAt?: number;

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
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.handlers.onStatus('failed');
      this.handlers.onError(`giving up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`);
      return;
    }
    const idx = Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1);
    const delay = RECONNECT_BACKOFF_MS[idx] ?? 15000;
    this.reconnectAttempt++;
    setTimeout(() => this.openSocket(), delay);
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'cmd':
        if (msg.cmd === 'resetTimer') {
          this.startedAt = Date.now();
          this.pumpStateSoon();
        } else {
          applyRemoteCommand(this.reveal, msg.cmd, msg.args);
        }
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

  private attachRevealHooks(): void {
    // 'ready' intentionally omitted: openSocket() pumps once on 'open',
    // which already covers the initial state push.
    const events = [
      'slidechanged',
      'fragmentshown',
      'fragmenthidden',
      'paused',
      'resumed',
      'overviewshown',
      'overviewhidden',
    ];
    for (const ev of events) this.reveal.on(ev, () => this.pumpStateSoon());
    // First user navigation starts the elapsed timer. Reveal does not fire
    // 'slidechanged' on initial setup (that's 'ready'), so this listener is
    // safe — it can't false-trigger on init.
    this.reveal.on('slidechanged', () => {
      if (this.startedAt === undefined) this.startedAt = Date.now();
    });
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
    const state = extractState(this.reveal, this.room.roomId, this.startedAt);
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { t: 'state', payload: state };
      this.ws.send(JSON.stringify(msg));
    }
  }
}
