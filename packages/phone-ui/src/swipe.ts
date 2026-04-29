// Direction-based swipe gesture: a horizontal-dominant drag anywhere on the
// surface fires onPrev (rightward) or onNext (leftward). Pure pointer events.
//
// Coexistence rules:
// - Touch only. Mouse/pen drags would hijack text selection and have no swipe
//   UX.
// - Vertical-dominant movement (|dy| > |dx|) abandons the gesture so notes-pane
//   scrolling still works when the touch happens to start in a swipeable area.
// - The host sets `touch-action: pan-y` on `body` so horizontal touches are
//   owned by JS rather than the browser's horizontal-pan default. Note: this
//   does NOT suppress iOS Safari's left-edge swipe-back — that gesture is
//   system-level. In the typical QR-scan flow the phone UI loads in a fresh
//   tab with no back history, so the system gesture has nothing to navigate
//   to and visually does nothing. A swipe at x≈0 in a tab with history will
//   still fire Safari back.
// - Commits the moment horizontal travel crosses TRIGGER_DX, not on pointerup.
//   After firing, the gesture self-disarms; a single touch fires at most once.

export interface SwipeHandlers {
  onPrev: () => void;
  onNext: () => void;
}

const TRIGGER_DX = 50;

interface ActiveGesture {
  pointerId: number;
  startX: number;
  startY: number;
}

export function attachSwipe(target: HTMLElement, handlers: SwipeHandlers): () => void {
  let active: ActiveGesture | null = null;

  const release = (pointerId: number): void => {
    active = null;
    // releasePointerCapture throws InvalidStateError if the pointer wasn't
    // captured (e.g. setPointerCapture failed under happy-dom). Ignore.
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      /* not captured */
    }
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    // Ignore second-finger pointerdowns while a gesture is in flight — an
    // accidental second touch shouldn't void or overwrite the first.
    if (active) return;
    active = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
    // Pin the pointer to `target` so subsequent move/up events keep flowing
    // even if the touch crosses an iframe or sibling element mid-gesture.
    // happy-dom may not implement setPointerCapture; swallow the throw.
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* unsupported in test env */
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (!active || e.pointerId !== active.pointerId) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    if (Math.abs(dy) > Math.abs(dx)) {
      release(e.pointerId);
      return;
    }
    if (dx > TRIGGER_DX) {
      handlers.onPrev();
      release(e.pointerId);
    } else if (dx < -TRIGGER_DX) {
      handlers.onNext();
      release(e.pointerId);
    }
  };

  const onEnd = (e: PointerEvent): void => {
    if (active?.pointerId === e.pointerId) release(e.pointerId);
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
