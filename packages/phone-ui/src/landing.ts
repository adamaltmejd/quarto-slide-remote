// Landing screen rendered when the phone-ui boots without a /r/{roomId}
// path. Lets a user paste a join link or type the dashed pairing code
// (e.g. R12V-P138) on a separate computer that can't easily scan the QR.
// Submit normalizes to /r/{roomId}#t={token} and navigates.

import { PAIR_CODE_RE, PAIR_PART_RE } from '@slide-remote/protocol';

export interface ParsedJoin {
  roomId: string;
  token: string;
}

// URL-shaped paste: pulls room and token directly out of the path+hash with
// a regex (rather than `new URL`) so origin-relative inputs like
// `/r/R12V#t=P138` work even when the host environment doesn't have a
// usable base URL — happy-dom in tests, but also any sandboxed iframe.
// Allows an optional query string between the path and the hash.
const URL_RE = /\/R\/([^/?#]+)(?:\?[^#]*)?#T=([^&]+)/;

// Accept any of:
//   https://host/r/R12V#t=P138   (full URL)
//   /r/R12V#t=P138               (origin-relative)
//   R12V-P138                    (dashed code)
//   R12VP138                     (no dash)
// Returns null on any unrecognized shape so the caller can show one
// "couldn't read that" error instead of a category-specific one.
export function parseInput(raw: string): ParsedJoin | null {
  const s = raw.trim().replace(/\s+/g, '').toUpperCase();
  if (!s) return null;

  if (s.includes('/R/')) {
    const m = URL_RE.exec(s);
    if (m?.[1] && m[2] && PAIR_PART_RE.test(m[1]) && PAIR_PART_RE.test(m[2])) {
      return { roomId: m[1], token: m[2] };
    }
    return null;
  }

  const m = PAIR_CODE_RE.exec(s);
  if (m?.[1] && m[2]) return { roomId: m[1], token: m[2] };
  return null;
}

export function buildLanding(): HTMLElement {
  const root = document.createElement('main');
  root.className = 'sr-landing';

  const form = document.createElement('form');
  form.className = 'sr-landing__form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sr-landing__input';
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.spellcheck = false;
  input.placeholder = 'R12V-P138';
  input.setAttribute('aria-label', 'pairing code or join link');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'sr-landing__submit';
  submit.textContent = 'Join';

  const error = document.createElement('p');
  error.className = 'sr-landing__error';
  error.hidden = true;

  form.append(input, submit);
  root.append(form, error);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.hidden = true;
    const parsed = parseInput(input.value);
    if (!parsed) {
      error.textContent =
        "Couldn't read that — paste the join link or enter the code as R12V-P138.";
      error.hidden = false;
      input.focus();
      input.select();
      return;
    }
    window.location.href = `/r/${parsed.roomId}#t=${parsed.token}`;
  });

  // Auto-focus so paste-and-enter is immediate.
  queueMicrotask(() => input.focus());

  return root;
}
