// Strip dangerous elements/attributes from notes HTML before shipping it to
// the phone. Allowlist of structural and inline tags that are useful in
// speaker notes; everything else is unwrapped to its text content.

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'br',
  'code',
  'em',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
]);

// Container tags whose content must be dropped entirely. Unwrapping these
// would leak raw CSS/JS/etc. as text in the sanitized output.
const DROP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'template',
  'object',
  'embed',
  'svg',
  'math',
  'head',
  'meta',
  'link',
]);

const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(['href']),
  img: new Set(['src', 'alt']),
};

function isSafeUrl(name: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith('javascript:')) return false;
  // Permit data: URIs only on img src for inline knitr-rendered graphics.
  if (v.startsWith('data:')) return name === 'src' && v.startsWith('data:image/');
  return true;
}

function sanitizeNode(node: Node, out: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return out.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (DROP_TAGS.has(tag)) return null;

  const children: Node[] = [];
  for (const child of Array.from(el.childNodes)) {
    const sanitized = sanitizeNode(child, out);
    if (sanitized) children.push(sanitized);
  }

  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap: drop the tag, keep its children.
    const frag = out.createDocumentFragment();
    for (const c of children) frag.appendChild(c);
    return frag;
  }

  const created = out.createElement(tag);
  const allowed = ALLOWED_ATTRS[tag];
  if (allowed) {
    for (const attr of Array.from(el.attributes)) {
      if (!allowed.has(attr.name)) continue;
      if ((attr.name === 'href' || attr.name === 'src') && !isSafeUrl(attr.name, attr.value)) {
        continue;
      }
      created.setAttribute(attr.name, attr.value);
    }
  }
  for (const c of children) created.appendChild(c);
  return created;
}

const parser = new DOMParser();

export function sanitizeNotesHtml(raw: string): string {
  if (!raw) return '';
  const doc = parser.parseFromString(`<div>${raw}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const out = document.implementation.createHTMLDocument();
  const cleaned = sanitizeNode(root, out);
  if (!cleaned) return '';
  const wrapper = out.createElement('div');
  wrapper.appendChild(cleaned);
  return wrapper.innerHTML;
}
