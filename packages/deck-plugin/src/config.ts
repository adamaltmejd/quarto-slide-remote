// Reads consumer config from <meta> tags emitted by filter.lua. Theme-agnostic.

export interface PluginConfig {
  workerUrl: string;
  showButton: boolean;
  disableOnParams: string[];
}

function meta(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? '';
}

export function readConfig(): PluginConfig {
  return {
    workerUrl: meta('slide-remote-worker-url'),
    showButton: meta('slide-remote-show-button') === 'true',
    disableOnParams: meta('slide-remote-disable-on-params')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function shouldDisable(cfg: PluginConfig): boolean {
  if (typeof window === 'undefined') return true;
  // Empty worker-url means the consumer didn't configure us; stay silent
  // rather than register listeners that lead nowhere.
  if (!cfg.workerUrl) return true;
  // Per-deck kill switch: <meta name="slide-remote-enabled" content="false">
  if (meta('slide-remote-enabled') === 'false') return true;
  const params = new URLSearchParams(window.location.search);
  if (params.has('print-pdf')) return true;
  for (const p of cfg.disableOnParams) {
    if (params.has(p)) return true;
  }
  if (navigator.webdriver) return true;
  return false;
}
