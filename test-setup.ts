// Registers happy-dom globals (DOMParser, document, Element, Node, …) so
// `bun test` can exercise modules that rely on the browser DOM. Loaded via
// bunfig.toml's [test] preload key.

import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
