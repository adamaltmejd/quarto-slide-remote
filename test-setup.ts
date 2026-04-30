// Registers happy-dom globals (DOMParser, document, Element, Node, …) so
// `bun test` can exercise modules that rely on the browser DOM. Loaded via
// bunfig.toml's [test] preload key.

import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// Phone-ui modules reference `__SR_VERSION__`, normally injected by
// Bun.build's `define` (see packages/phone-ui/build.ts). In tests there's
// no bundler pass, so populate it on globalThis directly.
(globalThis as Record<string, unknown>).__SR_VERSION__ = 'test';
