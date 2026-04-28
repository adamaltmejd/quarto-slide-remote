import { describe, expect, test } from 'bun:test';
import { applyRemoteCommand } from './client';
import type { RevealApi } from './types';

interface Calls {
  next: number;
  prev: number;
  togglePause: number;
}

function spy(): { reveal: RevealApi; calls: Calls } {
  const calls: Calls = { next: 0, prev: 0, togglePause: 0 };
  const reveal: RevealApi = {
    on: () => {},
    next: () => {
      calls.next++;
    },
    prev: () => {
      calls.prev++;
    },
    togglePause: () => {
      calls.togglePause++;
    },
    isPaused: () => false,
    getCurrentSlide: () => undefined,
    getSlide: () => undefined,
    getIndices: () => ({ h: 0, v: 0 }),
    getTotalSlides: () => 0,
  };
  return { reveal, calls };
}

describe('applyRemoteCommand', () => {
  test('next → reveal.next()', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'next');
    expect(calls.next).toBe(1);
  });

  test('prev → reveal.prev()', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'prev');
    expect(calls.prev).toBe(1);
  });

  test('black → reveal.togglePause()', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'black');
    expect(calls.togglePause).toBe(1);
  });
});
