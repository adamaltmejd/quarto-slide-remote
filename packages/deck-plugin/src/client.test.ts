import { describe, expect, test } from 'bun:test';
import { applyRemoteCommand } from './client';
import type { RevealApi } from './types';

interface Calls {
  next: number;
  prev: number;
  togglePause: number;
  slide: Array<{ h: number; v: number; f: number | undefined }>;
}

function spy(): { reveal: RevealApi; calls: Calls } {
  const calls: Calls = { next: 0, prev: 0, togglePause: 0, slide: [] };
  const reveal: RevealApi = {
    on: () => {},
    next: () => {
      calls.next++;
    },
    prev: () => {
      calls.prev++;
    },
    slide: (h, v, f) => {
      calls.slide.push({ h, v: v ?? 0, f });
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
    applyRemoteCommand(reveal, 'next', undefined);
    expect(calls.next).toBe(1);
  });

  test('prev → reveal.prev()', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'prev', undefined);
    expect(calls.prev).toBe(1);
  });

  test('black → reveal.togglePause()', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'black', undefined);
    expect(calls.togglePause).toBe(1);
  });

  test('goto with full args dispatches all three indices', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'goto', { h: 3, v: 1, f: 2 });
    expect(calls.slide).toEqual([{ h: 3, v: 1, f: 2 }]);
  });

  test('goto with only h defaults v to 0 and leaves f undefined', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'goto', { h: 5 });
    expect(calls.slide).toEqual([{ h: 5, v: 0, f: undefined }]);
  });

  test('goto without h is a no-op', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'goto', {});
    expect(calls.slide).toEqual([]);
  });

  test('goto with no args object is a no-op', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'goto', undefined);
    expect(calls.slide).toEqual([]);
  });

  test('goto with non-numeric h is rejected', () => {
    const { reveal, calls } = spy();
    applyRemoteCommand(reveal, 'goto', { h: '3' });
    expect(calls.slide).toEqual([]);
  });
});
