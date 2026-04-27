// Persist room/token in localStorage so a phone refresh stays paired.

const KEY = 'slide-remote.session';

export interface Session {
  roomId: string;
  token: string;
}

export function loadSession(roomId: string): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s.roomId !== roomId) {
      // Stale entry from an earlier room — drop it so a phone moving between
      // talks doesn't carry forward a token that no longer applies.
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore (Safari private mode etc.)
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
