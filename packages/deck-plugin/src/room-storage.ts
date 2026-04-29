// Persist a freshly-minted room across deck reloads so the phone stays
// paired through a Cmd+R on the deck. Stored in sessionStorage so:
// - It survives reload of the same tab (the only case we care about).
// - It dies on tab close — a presenter who closed the deck and reopens it
//   probably wants a fresh room rather than reconnecting blindly.
// - It is per-tab, so opening two decks in two tabs gives each its own room.
//
// Same-tab navigation between two different decks would re-use the room
// (sessionStorage is per-tab, not per-page); acceptable given that's an
// unusual flow. Two decks in the same tab is not a real authoring pattern.
//
// If the underlying Durable Object has been evicted (24h idle TTL, or a
// platform-level migration), the stored credentials are stale and the WS
// upgrade returns 401. Callers detect this by treating a close-before-open
// as "throw the stored room away and mint fresh".

import type { RoomCreateResponse } from '@slide-remote/protocol';

const STORAGE_KEY = 'slide-remote:room';

export function loadStoredRoom(): RoomCreateResponse | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomCreateResponse>;
    if (
      typeof parsed?.roomId !== 'string' ||
      typeof parsed?.presenterToken !== 'string' ||
      typeof parsed?.pairCode !== 'string' ||
      typeof parsed?.joinUrl !== 'string'
    ) {
      // Shape mismatch — likely a stored value from an earlier protocol
      // version. Treat as missing.
      return null;
    }
    return parsed as RoomCreateResponse;
  } catch {
    // sessionStorage unavailable (Safari private mode rejects writes only,
    // but reads can also throw in some embedded contexts) or invalid JSON.
    return null;
  }
}

export function storeRoom(room: RoomCreateResponse): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(room));
  } catch {
    // Storage quota / private mode — non-fatal. Worst case: the next reload
    // mints a fresh room and the phone has to be re-paired.
  }
}

export function clearStoredRoom(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

// Cheap "is there anything to resume?" probe used at plugin init to decide
// whether to auto-activate without a Shift+R prompt.
export function hasStoredRoom(): boolean {
  return loadStoredRoom() !== null;
}
