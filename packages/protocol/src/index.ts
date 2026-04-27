// Wire protocol shared between deck plugin, phone UI, and Worker DO.
// Messages are JSON over a WebSocket. Each side is either presenter (the deck)
// or viewer (the phone).
//
// Trust model: the worker doesn't enforce a single-presenter constraint. If
// two clients connect with role=presenter to the same room (e.g. the same
// deck reloaded in two tabs), both can publish state and the last write
// wins. This is intentional for v0.1 — one talk maps to one presenter
// token, and the cost of policing it isn't worth the implementation surface.
// It is *not* a robust multi-presenter protocol.

export type Role = 'presenter' | 'viewer';

export type Command = 'next' | 'prev' | 'goto' | 'black';

export interface SlideState {
  roomId: string;
  h: number;
  v: number;
  f?: number;
  total: number;
  title?: string;
  notesHtml?: string;
  nextTitle?: string;
  fragmentsLeft?: number;
  isPaused?: boolean;
  ts: number;
}

// What a client sends to the server.
export type ClientMessage =
  | { t: 'state'; payload: SlideState } // presenter only
  | { t: 'cmd'; cmd: Command; args?: unknown }; // viewer only

// What a client receives from the server.
//   - viewer receives `state_snapshot` (from presenter) and `peer`/`error`
//   - presenter receives `cmd` (forwarded from viewer) and `peer`/`error`
export type ServerMessage =
  | { t: 'state_snapshot'; payload: SlideState; serverTs: number }
  | { t: 'cmd'; cmd: Command; args?: unknown }
  | { t: 'peer'; presenter: number; viewer: number }
  | { t: 'error'; code: string; msg: string };

export interface RoomCreateResponse {
  roomId: string;
  presenterToken: string;
  joinUrl: string;
}
