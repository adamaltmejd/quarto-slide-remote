import { afterEach, describe, expect, test } from 'bun:test';
import { readConfig, shouldDisable } from './config';

function setMeta(name: string, content: string): void {
  let m = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement('meta');
    m.setAttribute('name', name);
    document.head.appendChild(m);
  }
  m.setAttribute('content', content);
}

function clearMetas(): void {
  for (const m of Array.from(document.head.querySelectorAll('meta'))) m.remove();
}

// happy-dom reports navigator.webdriver === true (intentional — it backs the
// decktape-silent invariant). Stub it to false for the "nothing applies" cases
// so we can prove the negative branch.
function withWebdriver(value: boolean, fn: () => void): void {
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(Navigator.prototype, 'webdriver', original);
    else delete (navigator as { webdriver?: boolean }).webdriver;
  }
}

afterEach(() => {
  clearMetas();
  history.replaceState(null, '', '/');
});

describe('readConfig', () => {
  test('parses meta tags into a typed config', () => {
    setMeta('slide-remote-worker-url', 'https://w.example');
    setMeta('slide-remote-show-button', 'true');
    setMeta('slide-remote-disable-on-params', 'handout, draft');
    const cfg = readConfig();
    expect(cfg.workerUrl).toBe('https://w.example');
    expect(cfg.showButton).toBe(true);
    expect(cfg.disableOnParams).toEqual(['handout', 'draft']);
  });

  test('absent metas yield safe defaults', () => {
    const cfg = readConfig();
    expect(cfg.workerUrl).toBe('');
    expect(cfg.showButton).toBe(false);
    expect(cfg.disableOnParams).toEqual([]);
  });
});

describe('shouldDisable', () => {
  test('empty workerUrl disables the plugin', () => {
    expect(shouldDisable({ workerUrl: '', showButton: false, disableOnParams: [] })).toBe(true);
  });

  test('slide-remote-enabled="false" meta disables the plugin', () => {
    setMeta('slide-remote-enabled', 'false');
    expect(shouldDisable({ workerUrl: 'https://w', showButton: false, disableOnParams: [] })).toBe(
      true,
    );
  });

  test('?print-pdf disables the plugin', () => {
    history.replaceState(null, '', '/?print-pdf');
    expect(shouldDisable({ workerUrl: 'https://w', showButton: false, disableOnParams: [] })).toBe(
      true,
    );
  });

  test('configured disable-on-param disables the plugin', () => {
    history.replaceState(null, '', '/?handout=true');
    expect(
      shouldDisable({ workerUrl: 'https://w', showButton: false, disableOnParams: ['handout'] }),
    ).toBe(true);
  });

  test('navigator.webdriver disables the plugin', () => {
    expect(shouldDisable({ workerUrl: 'https://w', showButton: false, disableOnParams: [] })).toBe(
      true,
    );
  });

  test('returns false when nothing applies', () => {
    withWebdriver(false, () => {
      expect(
        shouldDisable({ workerUrl: 'https://w', showButton: false, disableOnParams: [] }),
      ).toBe(false);
    });
  });

  test('slide-remote-enabled="true" does not disable', () => {
    setMeta('slide-remote-enabled', 'true');
    withWebdriver(false, () => {
      expect(
        shouldDisable({ workerUrl: 'https://w', showButton: false, disableOnParams: [] }),
      ).toBe(false);
    });
  });
});
