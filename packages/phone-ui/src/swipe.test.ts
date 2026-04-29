import { afterEach, describe, expect, test } from 'bun:test';
import { attachSwipe, type SwipeHandlers } from './swipe';

interface Counts {
  prev: number;
  next: number;
}

const detachers: Array<() => void> = [];

function setup(): { target: HTMLElement; counts: Counts; handlers: SwipeHandlers } {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const counts: Counts = { prev: 0, next: 0 };
  const handlers: SwipeHandlers = {
    onPrev: () => {
      counts.prev++;
    },
    onNext: () => {
      counts.next++;
    },
  };
  detachers.push(attachSwipe(target, handlers));
  return { target, counts, handlers };
}

afterEach(() => {
  while (detachers.length > 0) detachers.pop()?.();
  document.body.innerHTML = '';
});

function pointer(
  type: string,
  init: { x: number; y: number; pointerId?: number; pointerType?: string },
): PointerEvent {
  return new PointerEvent(type, {
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'touch',
    clientX: init.x,
    clientY: init.y,
    bubbles: true,
  });
}

describe('attachSwipe', () => {
  test('rightward swipe from anywhere fires onPrev', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 460, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 460, y: 400 }));
    expect(counts.prev).toBe(1);
    expect(counts.next).toBe(0);
  });

  test('leftward swipe from anywhere fires onNext', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 600, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 540, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 540, y: 400 }));
    expect(counts.next).toBe(1);
    expect(counts.prev).toBe(0);
  });

  test('rightward swipe starting at x=0 still fires onPrev (iOS back-swipe is suppressed via CSS)', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 0, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 80, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 80, y: 400 }));
    expect(counts.prev).toBe(1);
  });

  test('vertical scroll abandons the gesture', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400 }));
    // Move predominantly vertically — should disqualify.
    target.dispatchEvent(pointer('pointermove', { x: 410, y: 320 }));
    // Even if we then move enough horizontally, the gesture stays abandoned.
    target.dispatchEvent(pointer('pointermove', { x: 500, y: 320 }));
    target.dispatchEvent(pointer('pointerup', { x: 500, y: 320 }));
    expect(counts.prev).toBe(0);
    expect(counts.next).toBe(0);
  });

  test('short swipe under the trigger threshold does not fire', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 440, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 440, y: 400 }));
    expect(counts.prev).toBe(0);
    expect(counts.next).toBe(0);
  });

  test('mouse pointer is ignored', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400, pointerType: 'mouse' }));
    target.dispatchEvent(pointer('pointermove', { x: 460, y: 400, pointerType: 'mouse' }));
    target.dispatchEvent(pointer('pointerup', { x: 460, y: 400, pointerType: 'mouse' }));
    expect(counts.prev).toBe(0);
  });

  test('pen pointer is ignored', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400, pointerType: 'pen' }));
    target.dispatchEvent(pointer('pointermove', { x: 460, y: 400, pointerType: 'pen' }));
    target.dispatchEvent(pointer('pointerup', { x: 460, y: 400, pointerType: 'pen' }));
    expect(counts.prev).toBe(0);
  });

  test('second pointerdown during an active gesture is ignored', () => {
    // Two-finger sanity check: the first finger lands and starts moving, a
    // second finger drops before the first commits. The second pointerdown
    // must NOT void or overwrite the first; the first finger's swipe still
    // resolves to onPrev.
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400, pointerId: 1 }));
    target.dispatchEvent(pointer('pointerdown', { x: 700, y: 400, pointerId: 2 }));
    target.dispatchEvent(pointer('pointermove', { x: 460, y: 400, pointerId: 1 }));
    target.dispatchEvent(pointer('pointerup', { x: 460, y: 400, pointerId: 1 }));
    expect(counts.prev).toBe(1);
    expect(counts.next).toBe(0);
  });

  test('a fresh gesture works after a previous one commits', () => {
    // Ensure release() correctly clears the active slot so a second swipe in
    // the opposite direction still triggers.
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400, pointerId: 1 }));
    target.dispatchEvent(pointer('pointermove', { x: 460, y: 400, pointerId: 1 }));
    target.dispatchEvent(pointer('pointerup', { x: 460, y: 400, pointerId: 1 }));
    target.dispatchEvent(pointer('pointerdown', { x: 600, y: 400, pointerId: 2 }));
    target.dispatchEvent(pointer('pointermove', { x: 540, y: 400, pointerId: 2 }));
    target.dispatchEvent(pointer('pointerup', { x: 540, y: 400, pointerId: 2 }));
    expect(counts.prev).toBe(1);
    expect(counts.next).toBe(1);
  });

  test('detach removes listeners', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const counts: Counts = { prev: 0, next: 0 };
    const detach = attachSwipe(target, {
      onPrev: () => {
        counts.prev++;
      },
      onNext: () => {
        counts.next++;
      },
    });
    detach();
    target.dispatchEvent(pointer('pointerdown', { x: 400, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 460, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 460, y: 400 }));
    expect(counts.prev).toBe(0);
  });
});
