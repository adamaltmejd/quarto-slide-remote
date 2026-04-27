import { afterEach, describe, expect, mock, test } from 'bun:test';
import { WakeLockManager } from './wake-lock';

type Sentinel = {
  released: boolean;
  release: ReturnType<typeof mock>;
  addEventListener: ReturnType<typeof mock>;
  fireRelease(): void;
};

function makeSentinel(): Sentinel {
  let listener: (() => void) | undefined;
  const s = {
    released: false,
    release: mock(async () => {
      s.released = true;
      listener?.();
    }),
    addEventListener: mock((_t: 'release', l: () => void) => {
      listener = l;
    }),
    fireRelease(): void {
      s.released = true;
      listener?.();
    },
  };
  return s;
}

const originalWakeLock = (navigator as unknown as { wakeLock?: unknown }).wakeLock;

afterEach(() => {
  (navigator as unknown as { wakeLock?: unknown }).wakeLock = originalWakeLock;
});

describe('WakeLockManager', () => {
  test('acquire is a no-op when navigator.wakeLock is unavailable', async () => {
    (navigator as unknown as { wakeLock?: unknown }).wakeLock = undefined;
    const m = new WakeLockManager();
    await m.acquire();
    await m.release();
  });

  test('acquire requests the screen lock when supported', async () => {
    const sentinel = makeSentinel();
    const request = mock(async (_type: 'screen') => sentinel);
    (navigator as unknown as { wakeLock?: { request: typeof request } }).wakeLock = { request };

    const m = new WakeLockManager();
    await m.acquire();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe('screen');
    expect(sentinel.addEventListener).toHaveBeenCalledTimes(1);
  });

  test('release calls release on the held sentinel', async () => {
    const sentinel = makeSentinel();
    const request = mock(async () => sentinel);
    (navigator as unknown as { wakeLock?: { request: typeof request } }).wakeLock = { request };

    const m = new WakeLockManager();
    await m.acquire();
    await m.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  test('does not double-request while one is already held', async () => {
    const sentinel = makeSentinel();
    const request = mock(async () => sentinel);
    (navigator as unknown as { wakeLock?: { request: typeof request } }).wakeLock = { request };

    const m = new WakeLockManager();
    await m.acquire();
    await m.acquire();
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('swallows errors thrown by request()', async () => {
    const request = mock(async () => {
      throw new Error('NotAllowedError');
    });
    (navigator as unknown as { wakeLock?: { request: typeof request } }).wakeLock = { request };

    const m = new WakeLockManager();
    await m.acquire();
    await m.release();
  });
});
