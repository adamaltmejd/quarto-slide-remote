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

  test('release removes the visibilitychange listener it registered', async () => {
    const sentinel = makeSentinel();
    const request = mock(async () => sentinel);
    (navigator as unknown as { wakeLock?: { request: typeof request } }).wakeLock = { request };

    const added: Array<{ type: string; listener: EventListener }> = [];
    const removed: Array<{ type: string; listener: EventListener }> = [];
    const origAdd = document.addEventListener.bind(document);
    const origRemove = document.removeEventListener.bind(document);
    document.addEventListener = ((type: string, listener: EventListener) => {
      added.push({ type, listener });
      origAdd(type, listener);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, listener: EventListener) => {
      removed.push({ type, listener });
      origRemove(type, listener);
    }) as typeof document.removeEventListener;

    try {
      const m = new WakeLockManager();
      await m.acquire();
      const addedViz = added.filter((c) => c.type === 'visibilitychange');
      expect(addedViz.length).toBe(1);

      await m.release();
      const removedViz = removed.filter((c) => c.type === 'visibilitychange');
      expect(removedViz.length).toBe(1);
      expect(removedViz[0]?.listener).toBe(addedViz[0]?.listener);
    } finally {
      document.addEventListener = origAdd;
      document.removeEventListener = origRemove;
    }
  });

  test('release during a pending request drops the resolved sentinel', async () => {
    const sentinel = makeSentinel();
    let resolveRequest: ((s: typeof sentinel) => void) | undefined;
    const request = mock(
      () =>
        new Promise<typeof sentinel>((r) => {
          resolveRequest = r;
        }),
    );
    (navigator as unknown as { wakeLock?: { request: typeof request } }).wakeLock = { request };

    const m = new WakeLockManager();
    const acquiring = m.acquire();
    await m.release();
    resolveRequest?.(sentinel);
    await acquiring;

    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });
});
