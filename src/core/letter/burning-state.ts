export const BURN_DURATION_MS = 2700;
export const AFTERGLOW_DURATION_MS = 800;
export const SILENCE_DURATION_MS = 1800;
export const STAT_FADE_MS = 600;
export const STAT_HOLD_MS = 1800;
export const STAT_DURATION_MS = STAT_FADE_MS * 2 + STAT_HOLD_MS;
export const REBOUND_DURATION_MS = 300;
export const REDUCED_REBOUND_DURATION_MS = 120;
export const EDIT_RETURN_DURATION_MS = 320;
export const REDUCED_EDIT_RETURN_DURATION_MS = 140;
export const EDIT_ENTER_DURATION_MS = 320;
export const REDUCED_EDIT_ENTER_DURATION_MS = 140;
export const UNFOLD_DURATION_MS = 450;
export const REDUCED_UNFOLD_DURATION_MS = 150;
export const IGNITION_PREP_MS = 300;
export const THROW_DISTANCE_RATIO = 0.15;
export const THROW_SPEED_PX_PER_SECOND = 700;
export const MAX_FRAME_DELTA_MS = 100;
export const MAX_LETTER_TEXT_LENGTH = 200;

export type BurningPhase = 'idle' | 'draw' | 'unfold' | 'front' | 'edit' | 'edit-return' | 'back' | 'drag' | 'rebound' | 'burn' | 'fade' | 'silence' | 'stat';
export type BurningEffect = 'drawn' | 'requestEdit' | 'ignite' | 'save' | 'afterglow' | 'extinguish' | 'reset';

export interface BurningState {
  phase: BurningPhase;
  elapsedMs: number;
  pointerId: number | null;
  gestureStartY: number;
  gestureStartMs: number;
  lastY: number;
  lastMs: number;
  offsetY: number;
  reboundStartOffsetY: number;
  tiltDegrees: number;
  text: string;
  count: number | null;
  wantsStat: boolean;
}

export interface BurningUpdate {
  state: BurningState;
  effects: BurningEffect[];
}

export function createBurningState(): BurningState {
  return {
    phase: 'idle', elapsedMs: 0, pointerId: null, gestureStartY: 0, gestureStartMs: 0,
    lastY: 0, lastMs: 0, offsetY: 0, reboundStartOffsetY: 0, tiltDegrees: 0, text: '', count: null, wantsStat: false,
  };
}

export function beginDraw(state: BurningState, pointerId: number, y: number, atMs: number): BurningState {
  if (state.phase !== 'idle') return state;
  return { ...state, phase: 'draw', pointerId, gestureStartY: y, gestureStartMs: atMs, lastY: y, lastMs: atMs };
}

export function movePointer(state: BurningState, pointerId: number, y: number, atMs: number): BurningState {
  if (state.pointerId !== pointerId || (state.phase !== 'draw' && state.phase !== 'drag')) return state;
  const upward = Math.max(0, state.gestureStartY - y);
  const damped = upward * 0.85;
  const lateralHint = (state.lastY - y) * 0.05;
  return { ...state, offsetY: -damped, tiltDegrees: Math.max(-8, Math.min(8, lateralHint)), lastY: y, lastMs: atMs };
}

export function endDraw(state: BurningState, pointerId: number): BurningUpdate {
  if (state.phase !== 'draw' || state.pointerId !== pointerId) return { state, effects: [] };
  if (-state.offsetY < 56) return { state: createBurningState(), effects: [] };
  // 进入自动展开：保留 offsetY 作为展开动画的插值起点，展开结束才清零
  return { state: { ...state, phase: 'unfold', elapsedMs: 0, pointerId: null, tiltDegrees: 0 }, effects: ['drawn'] };
}

export function flipToBack(state: BurningState): BurningState {
  return state.phase === 'front' ? { ...state, phase: 'back', elapsedMs: 0 } : state;
}

export function beginEditing(state: BurningState): BurningState {
  if (state.phase !== 'front' && state.phase !== 'back' && state.phase !== 'drag') return state;
  return { ...state, phase: 'edit', elapsedMs: 0, pointerId: null, offsetY: 0, tiltDegrees: 0 };
}

export function normalizePostcardText(text: string): string {
  return Array.from(text.replace(/\r\n?/g, '\n')).slice(0, MAX_LETTER_TEXT_LENGTH).join('');
}

export function setPostcardText(state: BurningState, text: string): BurningState {
  return state.phase === 'edit' || state.phase === 'edit-return' || state.phase === 'back'
    ? { ...state, text: normalizePostcardText(text) }
    : state;
}

export function finishEditing(state: BurningState): BurningState {
  return state.phase === 'edit' ? { ...state, phase: 'edit-return', elapsedMs: 0, pointerId: null, offsetY: 0, tiltDegrees: 0 } : state;
}

export function beginThrow(state: BurningState, pointerId: number, y: number, atMs: number): BurningState {
  if (state.phase !== 'back') return state;
  return { ...state, phase: 'drag', pointerId, gestureStartY: y, gestureStartMs: atMs, lastY: y, lastMs: atMs };
}

export function endThrow(
  state: BurningState,
  pointerId: number,
  y: number,
  atMs: number,
  viewportHeight: number,
  wantsStat: boolean,
): BurningUpdate {
  if (state.phase !== 'drag' || state.pointerId !== pointerId) return { state, effects: [] };
  const distance = Math.max(0, state.gestureStartY - y);
  const elapsedSeconds = Math.max(0.001, (atMs - state.gestureStartMs) / 1000);
  const speed = distance / elapsedSeconds;
  if (distance >= viewportHeight * THROW_DISTANCE_RATIO || speed >= THROW_SPEED_PX_PER_SECOND) {
    return {
      state: { ...state, phase: 'burn', elapsedMs: -IGNITION_PREP_MS, pointerId: null, offsetY: 0, tiltDegrees: 0, wantsStat },
      effects: [],
    };
  }
  return { state: { ...state, phase: 'rebound', elapsedMs: 0, pointerId: null, reboundStartOffsetY: state.offsetY }, effects: [] };
}

export function resolveCount(state: BurningState, count: number | null): BurningState {
  return { ...state, count };
}

export function advanceBurningState(state: BurningState, deltaMs: number, reducedMotion = false): BurningUpdate {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return { state, effects: [] };
  if (!['unfold', 'edit', 'edit-return', 'rebound', 'burn', 'fade', 'silence', 'stat'].includes(state.phase)) return { state, effects: [] };
  let current = state;
  let remainingMs = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
  const effects: BurningEffect[] = [];
  for (let transitionCount = 0; transitionCount < 6 && remainingMs > 0; transitionCount += 1) {
    if (current.phase === 'unfold') {
      const durationMs = reducedMotion ? REDUCED_UNFOLD_DURATION_MS : UNFOLD_DURATION_MS;
      const consumedMs = Math.min(remainingMs, durationMs - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < durationMs) { current = { ...current, elapsedMs }; break; }
      current = { ...current, phase: 'edit', elapsedMs: 0, offsetY: 0 };
      effects.push('requestEdit');
      continue;
    }
    if (current.phase === 'edit') {
      const durationMs = reducedMotion ? REDUCED_EDIT_ENTER_DURATION_MS : EDIT_ENTER_DURATION_MS;
      const consumedMs = Math.min(remainingMs, durationMs - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      current = { ...current, elapsedMs };
      if (remainingMs === 0 || elapsedMs < durationMs) break;
      continue;
    }
    if (current.phase === 'rebound') {
      const durationMs = reducedMotion ? REDUCED_REBOUND_DURATION_MS : REBOUND_DURATION_MS;
      const consumedMs = Math.min(remainingMs, durationMs - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < durationMs) {
        const t = elapsedMs / durationMs;
        const overshoot = 1 - Math.pow(1 - t, 2) * Math.cos(t * Math.PI * 2 * 0.3);
        current = { ...current, elapsedMs, offsetY: current.reboundStartOffsetY * (1 - overshoot) };
        break;
      }
      current = { ...current, phase: 'back', elapsedMs: 0, offsetY: 0, reboundStartOffsetY: 0, tiltDegrees: 0 };
      continue;
    }
    if (current.phase === 'edit-return') {
      const durationMs = reducedMotion ? REDUCED_EDIT_RETURN_DURATION_MS : EDIT_RETURN_DURATION_MS;
      const consumedMs = Math.min(remainingMs, durationMs - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < durationMs) { current = { ...current, elapsedMs }; break; }
      current = { ...current, phase: 'back', elapsedMs: 0, offsetY: 0, tiltDegrees: 0 };
      continue;
    }
    if (current.phase === 'burn') {
      if (current.elapsedMs < 0) {
        const consumedMs = Math.min(remainingMs, -current.elapsedMs);
        const elapsedMs = current.elapsedMs + consumedMs;
        remainingMs -= consumedMs;
        current = { ...current, elapsedMs };
        if (elapsedMs < 0) break;
        effects.push('ignite');
        if (remainingMs === 0) break;
      }
      const consumedMs = Math.min(remainingMs, BURN_DURATION_MS - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < BURN_DURATION_MS) { current = { ...current, elapsedMs }; break; }
      current = { ...current, phase: 'fade', elapsedMs: 0 };
      effects.push('extinguish', 'save', 'afterglow');
      continue;
    }
    if (current.phase === 'fade') {
      const consumedMs = Math.min(remainingMs, AFTERGLOW_DURATION_MS - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < AFTERGLOW_DURATION_MS) { current = { ...current, elapsedMs }; break; }
      current = { ...current, phase: 'silence', elapsedMs: 0 };
      continue;
    }
    if (current.phase === 'silence') {
      const consumedMs = Math.min(remainingMs, SILENCE_DURATION_MS - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < SILENCE_DURATION_MS) { current = { ...current, elapsedMs }; break; }
      if (current.wantsStat && current.count !== null) { current = { ...current, phase: 'stat', elapsedMs: 0 }; continue; }
      current = createBurningState(); effects.push('reset'); break;
    }
    if (current.phase === 'stat') {
      const consumedMs = Math.min(remainingMs, STAT_DURATION_MS - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < STAT_DURATION_MS) { current = { ...current, elapsedMs }; break; }
      current = createBurningState(); effects.push('reset'); break;
    }
    break;
  }
  return { state: current, effects };
}

export function burnProgress(state: BurningState): number {
  return state.phase === 'burn' ? Math.max(0, Math.min(1, state.elapsedMs / BURN_DURATION_MS)) : 0;
}

export function afterglowVisual(state: BurningState): { alpha: number; radiusRatio: number } {
  if (state.phase !== 'fade') return { alpha: 0, radiusRatio: 0 };
  if (state.elapsedMs <= 200) return { alpha: 0.32, radiusRatio: 0.12 };
  const t = Math.min(1, (state.elapsedMs - 200) / 600);
  return { alpha: 0.32 * (1 - t), radiusRatio: 0.12 + t * 0.58 };
}

export function statAlpha(state: BurningState): number {
  if (state.phase !== 'stat') return 0;
  if (state.elapsedMs < STAT_FADE_MS) return state.elapsedMs / STAT_FADE_MS;
  if (state.elapsedMs < STAT_FADE_MS + STAT_HOLD_MS) return 1;
  return Math.max(0, 1 - (state.elapsedMs - STAT_FADE_MS - STAT_HOLD_MS) / STAT_FADE_MS);
}
