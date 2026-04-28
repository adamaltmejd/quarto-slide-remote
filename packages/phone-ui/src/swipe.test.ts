import { afterEach, describe, expect, test } from 'bun:test';
import { attachEdgeSwipe, type SwipeHandlers } from './swipe';

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
  detachers.push(attachEdgeSwipe(target, handlers));
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

describe('attachEdgeSwipe', () => {
  // window.innerWidth is 1024 in happy-dom by default. Right edge zone is
  // [1024 - 8 - 24, 1024 - 8] = [992, 1016]. Left edge zone is [8, 32].

  test('right-edge inward swipe fires onNext', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 1000, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 940, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 940, y: 400 }));
    expect(counts.next).toBe(1);
    expect(counts.prev).toBe(0);
  });

  test('left-edge inward swipe fires onPrev', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 16, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 80, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 80, y: 400 }));
    expect(counts.prev).toBe(1);
    expect(counts.next).toBe(0);
  });

  test('touch starting outside the edge zones is ignored', () => {
    const { target, counts } = setup();
    // Mid-screen swipe inward — should not fire either handler.
    target.dispatchEvent(pointer('pointerdown', { x: 500, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 600, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 600, y: 400 }));
    expect(counts.next).toBe(0);
    expect(counts.prev).toBe(0);
  });

  test('touch starting on the bezel (x=0) is ignored to let iOS back-swipe win', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 0, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 80, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 80, y: 400 }));
    expect(counts.prev).toBe(0);
  });

  test('vertical scroll abandons the gesture (does not hijack notes scrolling)', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 16, y: 400 }));
    // Move predominantly vertically — should disqualify.
    target.dispatchEvent(pointer('pointermove', { x: 30, y: 320 }));
    // Even if we then move enough horizontally, the gesture stays abandoned.
    target.dispatchEvent(pointer('pointermove', { x: 100, y: 320 }));
    target.dispatchEvent(pointer('pointerup', { x: 100, y: 320 }));
    expect(counts.prev).toBe(0);
    expect(counts.next).toBe(0);
  });

  test('short swipe under the trigger threshold does not fire', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 16, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 50, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 50, y: 400 }));
    expect(counts.prev).toBe(0);
  });

  test('mouse pointer is ignored', () => {
    const { target, counts } = setup();
    target.dispatchEvent(pointer('pointerdown', { x: 16, y: 400, pointerType: 'mouse' }));
    target.dispatchEvent(pointer('pointermove', { x: 80, y: 400, pointerType: 'mouse' }));
    target.dispatchEvent(pointer('pointerup', { x: 80, y: 400, pointerType: 'mouse' }));
    expect(counts.prev).toBe(0);
  });

  test('detach removes listeners', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const counts: Counts = { prev: 0, next: 0 };
    const detach = attachEdgeSwipe(target, {
      onPrev: () => {
        counts.prev++;
      },
      onNext: () => {
        counts.next++;
      },
    });
    detach();
    target.dispatchEvent(pointer('pointerdown', { x: 16, y: 400 }));
    target.dispatchEvent(pointer('pointermove', { x: 80, y: 400 }));
    target.dispatchEvent(pointer('pointerup', { x: 80, y: 400 }));
    expect(counts.prev).toBe(0);
  });
});
