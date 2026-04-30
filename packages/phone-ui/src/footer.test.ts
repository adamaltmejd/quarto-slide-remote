import { describe, expect, test } from 'bun:test';
import { buildFooter } from './footer';

describe('phone-ui footer', () => {
  test('renders slide-remote v<version> linking to the GitHub repo', () => {
    const footer = buildFooter();
    expect(footer.className).toBe('sr-footer');

    const a = footer.querySelector<HTMLAnchorElement>('a');
    expect(a).not.toBeNull();
    expect(a?.href).toBe('https://github.com/adamaltmejd/quarto-slide-remote');
    // test-setup.ts seeds __SR_VERSION__ = 'test'.
    expect(a?.textContent).toBe('slide-remote vtest');
    // External link hardening so the phone tab can't accumulate forward
    // history that would re-fire iOS Safari's edge-swipe back navigation.
    expect(a?.target).toBe('_blank');
    expect(a?.rel).toBe('noopener noreferrer');
  });
});
