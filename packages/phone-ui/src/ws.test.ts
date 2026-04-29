import { describe, expect, test } from 'bun:test';
import { ViewerClient } from './ws';

const noopHandlers = {
  onStatus() {},
  onSnapshot() {},
  onError() {},
};

describe('ViewerClient', () => {
  test('stop() removes the online listener registered in the constructor', () => {
    const added: Array<{ type: string; listener: EventListener }> = [];
    const removed: Array<{ type: string; listener: EventListener }> = [];
    const origAdd = globalThis.addEventListener.bind(globalThis);
    const origRemove = globalThis.removeEventListener.bind(globalThis);
    globalThis.addEventListener = ((type: string, listener: EventListener) => {
      added.push({ type, listener });
      origAdd(type, listener);
    }) as typeof globalThis.addEventListener;
    globalThis.removeEventListener = ((type: string, listener: EventListener) => {
      removed.push({ type, listener });
      origRemove(type, listener);
    }) as typeof globalThis.removeEventListener;

    try {
      const client = new ViewerClient('http://localhost', 'r', 't', noopHandlers);
      const onlineAdds = added.filter((c) => c.type === 'online');
      expect(onlineAdds.length).toBe(1);

      client.stop();
      const onlineRemoves = removed.filter((c) => c.type === 'online');
      expect(onlineRemoves.length).toBe(1);
      expect(onlineRemoves[0]?.listener).toBe(onlineAdds[0]?.listener);
    } finally {
      globalThis.addEventListener = origAdd;
      globalThis.removeEventListener = origRemove;
    }
  });
});
