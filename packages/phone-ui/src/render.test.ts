import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { SlideState } from '@slide-remote/protocol';
import { buildUi } from './render';

function makeState(over: Partial<SlideState> = {}): SlideState {
  return {
    roomId: 'r',
    h: 0,
    v: 0,
    total: 5,
    title: 'Hello',
    nextTitle: 'Next slide',
    ts: 0,
    ...over,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('phone-ui render', () => {
  test('NEXT, PREV, PAUSE buttons are wired to their handlers', () => {
    const onPrev = mock(() => {});
    const onNext = mock(() => {});
    const onPause = mock(() => {});
    const ui = buildUi({ onPrev, onNext, onPause });
    document.body.append(ui.root);

    const next = ui.root.querySelector<HTMLButtonElement>('.sr__btn--next');
    const prev = ui.root.querySelector<HTMLButtonElement>('.sr__btn--prev');
    const pause = ui.root.querySelector<HTMLButtonElement>('.sr__btn--pause');
    expect(next?.textContent).toBe('NEXT');
    expect(prev?.textContent).toBe('PREV');
    expect(pause?.textContent).toBe('PAUSE');

    next?.click();
    prev?.click();
    pause?.click();
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  test('PAUSE reflects the deck isPaused snapshot', () => {
    const ui = buildUi({ onPrev() {}, onNext() {}, onPause() {} });
    document.body.append(ui.root);
    const pause = ui.root.querySelector<HTMLButtonElement>('.sr__btn--pause');
    expect(pause?.dataset.active).toBe('false');
    expect(pause?.getAttribute('aria-pressed')).toBe('false');

    ui.setState(makeState({ isPaused: true }));
    expect(pause?.dataset.active).toBe('true');
    expect(pause?.getAttribute('aria-pressed')).toBe('true');
    expect(pause?.textContent).toBe('RESUME');

    ui.setState(makeState({ isPaused: false }));
    expect(pause?.dataset.active).toBe('false');
    expect(pause?.textContent).toBe('PAUSE');
  });

  test('next-slide row hides when there is no nextTitle', () => {
    const ui = buildUi({ onPrev() {}, onNext() {}, onPause() {} });
    document.body.append(ui.root);
    const nextRow = ui.root.querySelector<HTMLElement>('.sr__next');

    ui.setState(makeState({ nextTitle: 'Outline' }));
    expect(nextRow?.hidden).toBe(false);
    expect(nextRow?.textContent).toContain('Outline');

    ui.setState(makeState({ nextTitle: undefined }));
    expect(nextRow?.hidden).toBe(true);
  });

  test('notes text size persists across builds', () => {
    let ui = buildUi({ onPrev() {}, onNext() {}, onPause() {} });
    document.body.append(ui.root);
    const upBtn = ui.root.querySelectorAll<HTMLButtonElement>('.sr__size-btn')[1];
    upBtn?.click();
    upBtn?.click();
    const notesA = ui.root.querySelector<HTMLElement>('.sr__notes');
    const scaleA = notesA?.style.getPropertyValue('--sr-notes-scale');

    document.body.innerHTML = '';
    ui = buildUi({ onPrev() {}, onNext() {}, onPause() {} });
    document.body.append(ui.root);
    const notesB = ui.root.querySelector<HTMLElement>('.sr__notes');
    expect(notesB?.style.getPropertyValue('--sr-notes-scale')).toBe(scaleA ?? '');
  });

  test('size-down button disables at the smallest step', () => {
    const ui = buildUi({ onPrev() {}, onNext() {}, onPause() {} });
    document.body.append(ui.root);
    const [down] = ui.root.querySelectorAll<HTMLButtonElement>('.sr__size-btn');
    expect(down?.disabled).toBe(false);
    down?.click();
    expect(down?.disabled).toBe(true);
  });

  test('setStatus reflects state in the dot dataset and root attribute', () => {
    const ui = buildUi({ onPrev() {}, onNext() {}, onPause() {} });
    document.body.append(ui.root);
    ui.setStatus('paired', 'connected');
    const dot = ui.root.querySelector<HTMLElement>('.sr__dot');
    expect(dot?.dataset.state).toBe('connected');
    expect(ui.root.dataset.connection).toBe('connected');
  });
});
