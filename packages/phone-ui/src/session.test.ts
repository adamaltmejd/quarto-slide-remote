import { afterEach, describe, expect, test } from 'bun:test';
import { clearSession, loadSession, saveSession } from './session';

const KEY = 'slide-remote.session';

afterEach(() => {
  localStorage.clear();
});

describe('session', () => {
  test('save + load round-trips when the roomId matches', () => {
    saveSession({ roomId: 'a', token: 't' });
    expect(loadSession('a')).toEqual({ roomId: 'a', token: 't' });
  });

  test('returns null when nothing is stored', () => {
    expect(loadSession('a')).toBeNull();
  });

  test('returns null when the stored roomId does not match', () => {
    saveSession({ roomId: 'a', token: 't' });
    expect(loadSession('b')).toBeNull();
  });

  test('clears the stale entry on roomId mismatch', () => {
    saveSession({ roomId: 'a', token: 't' });
    loadSession('b');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('returns null on malformed JSON without throwing', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadSession('a')).toBeNull();
  });

  test('clearSession() wipes a stored entry', () => {
    saveSession({ roomId: 'a', token: 't' });
    clearSession();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
