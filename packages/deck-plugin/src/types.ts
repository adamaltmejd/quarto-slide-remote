// Reveal.js public API surface used by the plugin. Typed loosely on purpose:
// we only depend on what's documented and stable.

export interface RevealApi {
  on(event: string, handler: (e?: unknown) => void): void;
  off(event: string, handler: (e?: unknown) => void): void;
  next(): void;
  prev(): void;
  slide(h: number, v?: number, f?: number): void;
  togglePause(): void;
  isPaused(): boolean;
  isOverview(): boolean;
  getCurrentSlide(): HTMLElement | undefined;
  getSlide(h: number, v?: number): HTMLElement | undefined;
  getIndices(): { h: number; v: number; f?: number };
  getTotalSlides(): number;
  addKeyBinding(
    binding: { keyCode: number; key: string; description?: string },
    callback: () => void,
  ): void;
}

export interface RevealPlugin {
  id: string;
  init(reveal: RevealApi): void | Promise<void>;
}
