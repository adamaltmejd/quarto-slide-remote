// Edge-swipe gesture: swipe inward from the right edge to advance, from the
// left edge to go back. Pure pointer events — no library.
//
// Coexistence rules:
// - Touch only. Mouse drags would hijack text selection and have no edge UX.
// - Recognition starts EDGE_INSET pixels inboard from each side so iOS Safari's
//   system back-swipe (which fires only at x≈0) still wins at the bezel.
// - Vertical movement is treated as a notes-pane scroll: if |dy| ever exceeds
//   |dx| during a tracked gesture, abandon. So the gesture cannot hijack
//   scrolling that started in the edge zone.

export interface SwipeHandlers {
  onPrev: () => void;
  onNext: () => void;
}

const EDGE_INSET = 8;
const EDGE_WIDTH = 24;
const TRIGGER_DX = 50;

interface ActiveGesture {
  pointerId: number;
  side: 'left' | 'right';
  startX: number;
  startY: number;
}

export function attachEdgeSwipe(target: HTMLElement, handlers: SwipeHandlers): () => void {
  let active: ActiveGesture | null = null;

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const w = window.innerWidth;
    let side: ActiveGesture['side'] | null = null;
    if (e.clientX >= EDGE_INSET && e.clientX <= EDGE_INSET + EDGE_WIDTH) side = 'left';
    else if (e.clientX >= w - EDGE_INSET - EDGE_WIDTH && e.clientX <= w - EDGE_INSET)
      side = 'right';
    if (!side) return;
    active = { pointerId: e.pointerId, side, startX: e.clientX, startY: e.clientY };
  };

  const onMove = (e: PointerEvent): void => {
    if (!active || e.pointerId !== active.pointerId) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    if (Math.abs(dy) > Math.abs(dx)) {
      active = null;
      return;
    }
    if (active.side === 'left' && dx > TRIGGER_DX) {
      handlers.onPrev();
      active = null;
    } else if (active.side === 'right' && dx < -TRIGGER_DX) {
      handlers.onNext();
      active = null;
    }
  };

  const onEnd = (e: PointerEvent): void => {
    if (active?.pointerId === e.pointerId) active = null;
  };

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onEnd);
  target.addEventListener('pointercancel', onEnd);

  return (): void => {
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onEnd);
    target.removeEventListener('pointercancel', onEnd);
  };
}
