// Keeps the phone screen awake while it's actively paired with a deck.
//
// Why: iOS Safari (and Android browsers in Low Power Mode) sleep the screen
// aggressively. Once the screen sleeps the WebSocket gets dropped and the
// presenter loses their remote mid-talk. Holding a screen wake lock keeps
// the phone — and therefore the WS — alive while the page is visible.
//
// Browsers automatically release the lock when the tab becomes hidden, so we
// only need to re-acquire on visibilitychange → 'visible'.

type WakeLockSentinel = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
};

type WakeLockApi = {
  request(type: 'screen'): Promise<WakeLockSentinel>;
};

function getApi(): WakeLockApi | undefined {
  return (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
}

export class WakeLockManager {
  private sentinel?: WakeLockSentinel;
  private wanted = false;
  private vizListener?: () => void;

  /** Request and hold the screen wake lock until release() is called. */
  async acquire(): Promise<void> {
    this.wanted = true;
    if (!this.vizListener) {
      this.vizListener = () => {
        if (document.visibilityState === 'visible' && this.wanted) {
          void this.tryRequest();
        }
      };
      document.addEventListener('visibilitychange', this.vizListener);
    }
    await this.tryRequest();
  }

  /** Release the lock and stop trying to re-acquire it. */
  async release(): Promise<void> {
    this.wanted = false;
    const s = this.sentinel;
    this.sentinel = undefined;
    if (s && !s.released) {
      try {
        await s.release();
      } catch {
        // Browser may have released it already; ignore.
      }
    }
  }

  private async tryRequest(): Promise<void> {
    const api = getApi();
    if (!api) return;
    if (this.sentinel && !this.sentinel.released) return;
    if (document.visibilityState !== 'visible') return;
    try {
      const s = await api.request('screen');
      this.sentinel = s;
      s.addEventListener('release', () => {
        if (this.sentinel === s) this.sentinel = undefined;
      });
    } catch {
      // Permission denied / unsupported / page not focused. Try again on the
      // next visibilitychange — the user may have just backgrounded the tab.
    }
  }
}
