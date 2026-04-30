// Tiny version + repo-link footer pinned to the bottom-right corner.
// Visible on the landing screen and on /r/{room}; muted enough to not
// fight the controls. Mounted by main.ts alongside whatever main view
// is currently active.

const REPO_URL = 'https://github.com/adamaltmejd/quarto-slide-remote';

export function buildFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'sr-footer';
  const a = document.createElement('a');
  a.href = REPO_URL;
  a.textContent = `slide-remote v${__SR_VERSION__}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  footer.append(a);
  return footer;
}
