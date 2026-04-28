import { describe, expect, test } from 'bun:test';
import { parseInput } from './landing';

describe('landing parseInput', () => {
  test('dashed code', () => {
    expect(parseInput('R12V-P138')).toEqual({ roomId: 'R12V', token: 'P138' });
  });

  test('undashed code', () => {
    expect(parseInput('R12VP138')).toEqual({ roomId: 'R12V', token: 'P138' });
  });

  test('lowercase is normalized to uppercase', () => {
    expect(parseInput('r12v-p138')).toEqual({ roomId: 'R12V', token: 'P138' });
  });

  test('whitespace tolerated around and within', () => {
    expect(parseInput('  R12V - P138  ')).toEqual({ roomId: 'R12V', token: 'P138' });
  });

  test('full URL with hash token', () => {
    expect(parseInput('https://x.example/r/R12V#t=P138')).toEqual({
      roomId: 'R12V',
      token: 'P138',
    });
  });

  test('origin-relative path with hash token', () => {
    expect(parseInput('/r/R12V#t=P138')).toEqual({ roomId: 'R12V', token: 'P138' });
  });

  test('rejects forbidden Crockford-32 letters (I/L/O/U)', () => {
    expect(parseInput('RIVL-P138')).toBeNull(); // I and L
    expect(parseInput('R12V-P1U8')).toBeNull(); // U
    expect(parseInput('R12V-P1O8')).toBeNull(); // O
  });

  test('rejects wrong-length parts', () => {
    expect(parseInput('R12-P138')).toBeNull();
    expect(parseInput('R12VV-P138')).toBeNull();
  });

  test('rejects URL without token fragment', () => {
    expect(parseInput('https://x.example/r/R12V')).toBeNull();
  });

  test('rejects URL with bad room id', () => {
    expect(parseInput('https://x.example/r/badroom#t=P138')).toBeNull();
  });

  test('rejects empty input', () => {
    expect(parseInput('')).toBeNull();
    expect(parseInput('   ')).toBeNull();
  });

  test('rejects garbage', () => {
    expect(parseInput('hello world')).toBeNull();
  });
});
