import { describe, expect, test } from 'bun:test';
import { sanitizeNotesHtml } from './sanitize';

describe('sanitizeNotesHtml — DROP_TAGS', () => {
  test('<style> content does not leak as text (regression)', () => {
    const dirty = `<style>.foo{color:red}</style><p>visible</p>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('color:red');
    expect(clean).not.toContain('.foo');
    expect(clean).toContain('<p>visible</p>');
  });

  test('<script> body is dropped, not unwrapped', () => {
    const dirty = `<p>before</p><script>alert(1)</script><p>after</p>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('alert(1)');
    expect(clean).toContain('<p>before</p>');
    expect(clean).toContain('<p>after</p>');
  });

  test('<svg> and <math> bodies are dropped', () => {
    const dirty = `<svg><circle r="5"/></svg><math><mi>x</mi></math><p>ok</p>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('circle');
    expect(clean).not.toContain('<mi>');
    expect(clean).toContain('<p>ok</p>');
  });

  test('<iframe>, <object>, <embed>, <link>, <meta> are dropped', () => {
    const dirty = `
      <iframe src="x"></iframe>
      <object data="x"></object>
      <embed src="x">
      <link rel="stylesheet" href="x">
      <meta name="x">
      <p>kept</p>
    `;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toMatch(/iframe|object|embed|<link|<meta/i);
    expect(clean).toContain('<p>kept</p>');
  });
});

describe('sanitizeNotesHtml — allowlist', () => {
  test('preserves structural tags', () => {
    const dirty = `<p>p</p><ul><li>li</li></ul><ol><li>li</li></ol><pre>pre</pre>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).toContain('<p>p</p>');
    expect(clean).toContain('<ul><li>li</li></ul>');
    expect(clean).toContain('<ol><li>li</li></ol>');
    expect(clean).toContain('<pre>pre</pre>');
  });

  test('preserves inline tags including <code>', () => {
    const dirty = `<strong>s</strong><em>e</em><code>c</code><b>b</b><i>i</i><span>x</span><br>`;
    const clean = sanitizeNotesHtml(dirty);
    for (const expected of [
      '<strong>s</strong>',
      '<em>e</em>',
      '<code>c</code>',
      '<b>b</b>',
      '<i>i</i>',
      '<span>x</span>',
      '<br>',
    ]) {
      expect(clean).toContain(expected);
    }
  });

  test('unknown tags unwrap to keep their text content', () => {
    const dirty = `<div><section><p>kept</p></section></div>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('<div>');
    expect(clean).not.toContain('<section>');
    expect(clean).toContain('<p>kept</p>');
  });

  test('strips disallowed attributes from allowed tags', () => {
    const dirty = `<p onclick="bad()" class="x" id="y">hi</p>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('class');
    expect(clean).not.toContain('id=');
    expect(clean).toContain('<p>hi</p>');
  });

  test('preserves table tags so cell text doesnt collapse into one run', () => {
    const dirty = `<table><thead><tr><th>k</th><th>v</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table>`;
    const clean = sanitizeNotesHtml(dirty);
    for (const tag of ['table', 'thead', 'tbody', 'tr', 'th', 'td']) {
      expect(clean).toContain(`<${tag}>`);
    }
    expect(clean).toContain('<th>k</th>');
    expect(clean).toContain('<td>1</td>');
  });

  test('keeps href on <a>, alt+src on <img>', () => {
    const dirty = `<a href="https://example.com">x</a><img src="https://e/i.png" alt="i" width="10">`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('alt="i"');
    expect(clean).toContain('src="https://e/i.png"');
    expect(clean).not.toContain('width');
  });

  test('forces target=_blank and rel on notes links so the phone-ui tab does not accumulate history', () => {
    const dirty = `<a href="https://example.com">x</a>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  test('does not add target/rel to <a> without href (anchor without navigation)', () => {
    const dirty = `<a>just text</a>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('target=');
    expect(clean).not.toContain('rel=');
  });

  test('overrides any inbound target/rel — sanitizer is authoritative', () => {
    const dirty = `<a href="https://example.com" target="_self" rel="opener">x</a>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).not.toContain('target="_self"');
    expect(clean).not.toContain('rel="opener"');
  });
});

describe('sanitizeNotesHtml — isSafeUrl', () => {
  test('javascript: blocked on href', () => {
    const dirty = `<a href="javascript:alert(1)">x</a>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('javascript:');
  });

  test('javascript: blocked on img src', () => {
    const dirty = `<img src="javascript:alert(1)">`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('javascript:');
  });

  test('javascript: blocked even with leading whitespace and uppercase', () => {
    const dirty = `<a href="  JaVaScRiPt:alert(1)">x</a>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean.toLowerCase()).not.toContain('javascript:');
  });

  test('data:image/png allowed on img.src', () => {
    const dirty = `<img src="data:image/png;base64,iVBORw0KGgo=" alt="dot">`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).toContain('data:image/png;base64');
  });

  test('data: blocked on a.href even for image type', () => {
    const dirty = `<a href="data:image/png;base64,xxx">x</a>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('data:');
  });

  test('data:text/html blocked on img.src', () => {
    const dirty = `<img src="data:text/html,<script>alert(1)</script>">`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).not.toContain('data:');
  });

  test('http(s) and relative urls pass through', () => {
    for (const src of ['http://e/x.png', 'https://e/x.png', '/img/x.png', 'x.png']) {
      const clean = sanitizeNotesHtml(`<img src="${src}">`);
      expect(clean).toContain(`src="${src}"`);
    }
  });
});

describe('sanitizeNotesHtml — edge cases', () => {
  test('empty input returns empty string', () => {
    expect(sanitizeNotesHtml('')).toBe('');
  });

  test('plain text with no tags survives unchanged', () => {
    expect(sanitizeNotesHtml('hello world')).toContain('hello world');
  });

  test('nested allowed tags preserved', () => {
    const dirty = `<p>a <strong>b <em>c</em></strong> d</p>`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).toContain('<p>a <strong>b <em>c</em></strong> d</p>');
  });

  test('text content inside dropped tag is gone, surrounding text kept', () => {
    const dirty = `before<style>.x{}</style>after`;
    const clean = sanitizeNotesHtml(dirty);
    expect(clean).toContain('before');
    expect(clean).toContain('after');
    expect(clean).not.toContain('.x{}');
  });
});
