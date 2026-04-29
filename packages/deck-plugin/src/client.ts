// WebSocket client for the deck side. Mints a room, opens the WS as
// presenter, pumps state on Reveal events, applies incoming commands.

import type {
  ClientMessage,
  Command,
  RoomCreateResponse,
  ServerMessage,
} from '@slide-remote/protocol';
import { extractState } from './extract';
import { clearStoredRoom, loadStoredRoom, storeRoom } from './room-storage';
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
export function applyRemoteCommand(reveal: RevealApi, cmd: RevealCommand): void {
  switch (cmd) {
    case 'next':
      reveal.next();
      break;
    case 'prev':
      reveal.prev();
      break;
    case 'black':
      reveal.togglePause();
      break;
  }
}

export interface ClientHandlers {
  onConnected(joinUrl: string, roomId: string, pairCode: string): void;
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
  // Tracks whether the active connection started from a sessionStorage hit
  // rather than a fresh mint. If the WS closes before opening, we treat the
  // stored room as stale and re-mint instead of looping reconnect attempts
  // against a Durable Object that no longer recognizes the token.
  private usingStoredRoom = false;
  private hasOpenedSinceStart = false;
  private revealHooksAttached = false;
  // Bumped on every openSocket and on regenerate; in-flight WS handlers
  // capture the value at create time and bail if it no longer matches.
  // Lets regenerate() retire stale connections without races.
  private generation = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private workerUrl: string,
    private reveal: RevealApi,
    private handlers: ClientHandlers,
  ) {}

  getRoom(): RoomCreateResponse | undefined {
    return this.room;
  }

  async start(): Promise<void> {
    // Re-use a previously-minted room if sessionStorage has one — keeps the
    // phone paired across a deck reload. If the room is stale, openSocket
    // detects the close-before-open and falls back to mintAndConnect.
    const stored = loadStoredRoom();
    if (stored) {
      this.room = stored;
      this.usingStoredRoom = true;
      this.handlers.onConnected(stored.joinUrl, stored.roomId, stored.pairCode);
      this.openSocket();
      this.attachRevealHooks();
      return;
    }
    await this.mintAndConnect();
  }

  private async mintAndConnect(): Promise<void> {
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
    storeRoom(this.room);
    this.handlers.onConnected(this.room.joinUrl, this.room.roomId, this.room.pairCode);
    this.openSocket();
    this.attachRevealHooks();
  }

  private openSocket(): void {
    if (!this.room) return;
    const myGen = ++this.generation;
    const url = new URL('/api/ws', this.workerUrl);
    url.protocol = url.protocol.replace(/^http/, 'ws');
    url.searchParams.set('room', this.room.roomId);
    url.searchParams.set('role', 'presenter');
    url.searchParams.set('token', this.room.presenterToken);

    this.handlers.onStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (myGen !== this.generation) return;
      this.reconnectAttempt = 0;
      this.usingStoredRoom = false;
      this.hasOpenedSinceStart = true;
      this.handlers.onStatus('connected');
      // Push current state so a freshly reconnected viewer sees the right slide.
      this.pumpStateNow();
    });

    ws.addEventListener('message', (e) => {
      if (myGen !== this.generation) return;
      if (typeof e.data !== 'string') return;
      try {
        this.handleServerMessage(JSON.parse(e.data) as ServerMessage);
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener('close', () => {
      if (myGen !== this.generation) return;
      // Close-before-open with a stored room means the underlying DO no
      // longer recognises the token (24h idle TTL elapsed, or platform-level
      // eviction). Drop the stale credentials and start over with a fresh
      // mint instead of reconnect-looping forever.
      if (this.usingStoredRoom && !this.hasOpenedSinceStart) {
        this.usingStoredRoom = false;
        clearStoredRoom();
        this.room = undefined;
        void this.mintAndConnect();
        return;
      }
      this.handlers.onStatus('disconnected');
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // close handler will fire next; nothing to do here.
    });
  }

  // Mint a fresh room, invalidating the current pairing. The phone (if any)
  // sees its WS close and ends up at 'failed' once reconnect attempts
  // exhaust against the new token. The presenter is the one initiating
  // this, so the disruption is intentional.
  async regenerate(): Promise<void> {
    // Bump generation so any in-flight WS event handlers see a stale gen
    // and bail out before doing reconnect or stale-room recovery work.
    this.generation++;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* already closed */
      }
      this.ws = undefined;
    }
    this.room = undefined;
    this.usingStoredRoom = false;
    this.hasOpenedSinceStart = false;
    this.reconnectAttempt = 0;
    clearStoredRoom();
    await this.mintAndConnect();
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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, delay);
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'cmd':
        if (msg.cmd === 'resetTimer') {
          this.startedAt = Date.now();
          this.pumpStateSoon();
        } else {
          applyRemoteCommand(this.reveal, msg.cmd);
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
    // Idempotent: a stored-room→stale→re-mint path calls this twice.
    if (this.revealHooksAttached) return;
    this.revealHooksAttached = true;
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
