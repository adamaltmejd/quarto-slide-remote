import { describe, expect, test } from 'bun:test';
import type { ClientMessage, RoomCreateResponse, ServerMessage, SlideState } from './index';

function roundtrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('protocol round-trip', () => {
  test('SlideState survives JSON', () => {
    const state: SlideState = {
      roomId: 'r1',
      h: 3,
      v: 1,
      f: 0,
      total: 12,
      title: 'Section',
      notesHtml: '<p>note</p>',
      nextTitle: 'Next',
      fragmentsLeft: 2,
      isPaused: false,
      startedAt: 1700000000000,
      ts: 1700000001234,
    };
    expect(roundtrip(state)).toEqual(state);
  });

  test('ClientMessage state', () => {
    const msg: ClientMessage = {
      t: 'state',
      payload: { roomId: 'r', h: 0, v: 0, total: 1, ts: 1 },
    };
    expect(roundtrip(msg)).toEqual(msg);
  });

  test('ClientMessage cmd with args', () => {
    const msg: ClientMessage = { t: 'cmd', cmd: 'goto', args: { h: 2, v: 0 } };
    expect(roundtrip(msg)).toEqual(msg);
  });

  test('ServerMessage state_snapshot', () => {
    const msg: ServerMessage = {
      t: 'state_snapshot',
      payload: { roomId: 'r', h: 0, v: 0, total: 1, ts: 1 },
      serverTs: 2,
    };
    expect(roundtrip(msg)).toEqual(msg);
  });

  test('ServerMessage peer/error', () => {
    const peer: ServerMessage = { t: 'peer', presenter: 1, viewer: 2 };
    const err: ServerMessage = { t: 'error', code: 'AUTH', msg: 'bad token' };
    expect(roundtrip(peer)).toEqual(peer);
    expect(roundtrip(err)).toEqual(err);
  });

  test('RoomCreateResponse round-trip', () => {
    const room: RoomCreateResponse = {
      roomId: 'ABCD1234',
      presenterToken: 'deadbeef',
      joinUrl: 'https://example/r/ABCD1234#t=deadbeef',
    };
    expect(roundtrip(room)).toEqual(room);
  });

  test('discriminant `t` survives parsing as union', () => {
    const wire = '{"t":"cmd","cmd":"next"}';
    const parsed = JSON.parse(wire) as ClientMessage;
    if (parsed.t === 'cmd') {
      expect(parsed.cmd).toBe('next');
    } else {
      throw new Error('discriminant lost');
    }
  });
});
