import { afterEach, describe, expect, test } from 'bun:test';
import type { RoomCreateResponse } from '@slide-remote/protocol';
import { clearStoredRoom, loadStoredRoom, storeRoom } from './room-storage';

const STORAGE_KEY = 'slide-remote:room';

afterEach(() => {
  sessionStorage.removeItem(STORAGE_KEY);
});

const sampleRoom: RoomCreateResponse = {
  roomId: 'R12V',
  presenterToken: 'P138',
  pairCode: 'R12V-P138',
  joinUrl: 'https://example.test/r/R12V#t=P138',
};

describe('room-storage', () => {
  test('storeRoom + loadStoredRoom round-trips a valid response', () => {
    storeRoom(sampleRoom);
    expect(loadStoredRoom()).toEqual(sampleRoom);
  });

  test('loadStoredRoom returns null when nothing is stored', () => {
    expect(loadStoredRoom()).toBeNull();
  });

  test('clearStoredRoom removes the entry so subsequent load is null', () => {
    storeRoom(sampleRoom);
    clearStoredRoom();
    expect(loadStoredRoom()).toBeNull();
  });

  test('loadStoredRoom returns null on malformed JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not json {');
    expect(loadStoredRoom()).toBeNull();
  });

  test('loadStoredRoom returns null when stored shape is missing fields (e.g. an older protocol version)', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId: 'X' }));
    expect(loadStoredRoom()).toBeNull();
  });

  test('loadStoredRoom returns null when fields are wrong type', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ roomId: 1, presenterToken: 2, pairCode: 3, joinUrl: 4 }),
    );
    expect(loadStoredRoom()).toBeNull();
  });
});
