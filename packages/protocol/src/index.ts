// Wire protocol shared between deck plugin, phone UI, and Worker DO.
// Messages are JSON over a WebSocket. Each side is either presenter (the deck)
// or viewer (the phone).

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
