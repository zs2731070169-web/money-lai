/**
 * 心里话倾诉主循环状态机：信封抽取 → 对折展开 → 全屏书写 → 展示位停留 → 上滑收好入袋。
 * 完成语义：确认/取消只回展示位；上滑释放达阈值进入收好（settle），落库结算在收好动画结束触发。
 */
export const STAT_FADE_MS = 600;
export const STAT_HOLD_MS = 1800;
export const STAT_DURATION_MS = STAT_FADE_MS * 2 + STAT_HOLD_MS;
export const EDIT_RETURN_DURATION_MS = 320;
export const REDUCED_EDIT_RETURN_DURATION_MS = 140;
export const EDIT_ENTER_DURATION_MS = 320;
export const REDUCED_EDIT_ENTER_DURATION_MS = 140;
export const UNFOLD_DURATION_MS = 450;
export const REDUCED_UNFOLD_DURATION_MS = 150;
/** 确认后信纸折回插入信封的收好动画时长。 */
export const SETTLE_DURATION_MS = 450;
export const REDUCED_SETTLE_DURATION_MS = 150;
/** 收好完成后的安静窗口：等待匿名计数返回以决定统计句显示，BGM 连续不打断。 */
export const QUIET_DURATION_MS = 1500;
/** 展示位上滑收好阈值：位移达屏高比例或释放速度超阈值即入袋；未达则回弹。 */
export const TUCK_DISTANCE_RATIO = 0.15;
export const TUCK_SPEED_PX_PER_SECOND = 700;
export const REBOUND_DURATION_MS = 300;
export const REDUCED_REBOUND_DURATION_MS = 120;
export const MAX_FRAME_DELTA_MS = 100;
export const MAX_LETTER_TEXT_LENGTH = 400;

export type LetterPhase = 'idle' | 'draw' | 'unfold' | 'edit' | 'edit-return' | 'back' | 'drag' | 'rebound' | 'settle' | 'quiet' | 'stat';
export type LetterEffect = 'drawn' | 'requestEdit' | 'save' | 'reset';

export interface LetterState {
  phase: LetterPhase;
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

export interface LetterUpdate {
  state: LetterState;
  effects: LetterEffect[];
}

export function createLetterState(): LetterState {
  return {
    phase: 'idle', elapsedMs: 0, pointerId: null, gestureStartY: 0, gestureStartMs: 0,
    lastY: 0, lastMs: 0, offsetY: 0, reboundStartOffsetY: 0, tiltDegrees: 0, text: '', count: null, wantsStat: false,
  };
}

export function beginDraw(state: LetterState, pointerId: number, y: number, atMs: number): LetterState {
  if (state.phase !== 'idle') return state;
  return { ...state, phase: 'draw', pointerId, gestureStartY: y, gestureStartMs: atMs, lastY: y, lastMs: atMs };
}

export function movePointer(state: LetterState, pointerId: number, y: number, atMs: number): LetterState {
  if (state.pointerId !== pointerId || (state.phase !== 'draw' && state.phase !== 'drag')) return state;
  const upward = Math.max(0, state.gestureStartY - y);
  const damped = upward * 0.85;
  const lateralHint = (state.lastY - y) * 0.05;
  return { ...state, offsetY: -damped, tiltDegrees: Math.max(-8, Math.min(8, lateralHint)), lastY: y, lastMs: atMs };
}

export function endDraw(state: LetterState, pointerId: number): LetterUpdate {
  if (state.phase !== 'draw' || state.pointerId !== pointerId) return { state, effects: [] };
  if (-state.offsetY < 56) return { state: createLetterState(), effects: [] };
  // 进入自动展开：保留 offsetY 作为展开动画的插值起点，展开结束才清零
  return { state: { ...state, phase: 'unfold', elapsedMs: 0, pointerId: null, tiltDegrees: 0 }, effects: ['drawn'] };
}

export function beginEditing(state: LetterState): LetterState {
  // 展示位与上滑拖拽中的快速点按都可进入编辑（拖拽先被 beginTuck 接住，抬手小位移即视为点按）
  if (state.phase !== 'back' && state.phase !== 'drag') return state;
  return { ...state, phase: 'edit', elapsedMs: 0, pointerId: null, offsetY: 0, tiltDegrees: 0 };
}

export function normalizePostcardText(text: string): string {
  return Array.from(text.replace(/\r\n?/g, '\n')).slice(0, MAX_LETTER_TEXT_LENGTH).join('');
}

export function setPostcardText(state: LetterState, text: string): LetterState {
  return state.phase === 'edit' || state.phase === 'edit-return' || state.phase === 'back'
    ? { ...state, text: normalizePostcardText(text) }
    : state;
}

/**
 * 退出编辑：确认与取消都只回缩到展示位停住；收好入袋由展示位上滑手势触发。
 */
export function finishEditing(state: LetterState): LetterState {
  return state.phase === 'edit'
    ? { ...state, phase: 'edit-return', elapsedMs: 0, pointerId: null, offsetY: 0, tiltDegrees: 0 }
    : state;
}

/** 展示位按住信纸开始上滑收好拖拽；释放由 endTuck 判定入袋或回弹。 */
export function beginTuck(state: LetterState, pointerId: number, y: number, atMs: number): LetterState {
  if (state.phase !== 'back') return state;
  return { ...state, phase: 'drag', pointerId, gestureStartY: y, gestureStartMs: atMs, lastY: y, lastMs: atMs };
}

/** 释放判定：位移达屏高比例或速度超阈值进入收好（携带统计节奏意图），否则回弹展示位。 */
export function endTuck(
  state: LetterState,
  pointerId: number,
  y: number,
  atMs: number,
  viewportHeight: number,
  wantsStat: boolean,
): LetterUpdate {
  if (state.phase !== 'drag' || state.pointerId !== pointerId) return { state, effects: [] };
  const distance = Math.max(0, state.gestureStartY - y);
  const elapsedSeconds = Math.max(0.001, (atMs - state.gestureStartMs) / 1000);
  const speed = distance / elapsedSeconds;
  if (distance >= viewportHeight * TUCK_DISTANCE_RATIO || speed >= TUCK_SPEED_PX_PER_SECOND) {
    return { state: { ...state, phase: 'settle', elapsedMs: 0, pointerId: null, offsetY: 0, tiltDegrees: 0, wantsStat }, effects: [] };
  }
  return { state: { ...state, phase: 'rebound', elapsedMs: 0, pointerId: null, reboundStartOffsetY: state.offsetY }, effects: [] };
}

export function resolveCount(state: LetterState, count: number | null): LetterState {
  return { ...state, count };
}

export function advanceLetterState(state: LetterState, deltaMs: number, reducedMotion = false): LetterUpdate {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return { state, effects: [] };
  if (!['unfold', 'edit', 'edit-return', 'rebound', 'settle', 'quiet', 'stat'].includes(state.phase)) return { state, effects: [] };
  let current = state;
  let remainingMs = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
  const effects: LetterEffect[] = [];
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
    if (current.phase === 'settle') {
      const durationMs = reducedMotion ? REDUCED_SETTLE_DURATION_MS : SETTLE_DURATION_MS;
      const consumedMs = Math.min(remainingMs, durationMs - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < durationMs) { current = { ...current, elapsedMs }; break; }
      // 收好完成即结算：落库、里程与匿名计数都由编排层在 'save' 上挂接
      effects.push('save');
      if (current.wantsStat) { current = { ...current, phase: 'quiet', elapsedMs: 0 }; continue; }
      current = createLetterState(); effects.push('reset'); break;
    }
    if (current.phase === 'quiet') {
      const consumedMs = Math.min(remainingMs, QUIET_DURATION_MS - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < QUIET_DURATION_MS) { current = { ...current, elapsedMs }; break; }
      // 计数已返回且本次满足节奏才显示统计句，否则静默复位（离线降级）
      if (current.wantsStat && current.count !== null) { current = { ...current, phase: 'stat', elapsedMs: 0 }; continue; }
      current = createLetterState(); effects.push('reset'); break;
    }
    if (current.phase === 'stat') {
      const consumedMs = Math.min(remainingMs, STAT_DURATION_MS - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < STAT_DURATION_MS) { current = { ...current, elapsedMs }; break; }
      current = createLetterState(); effects.push('reset'); break;
    }
    break;
  }
  return { state: current, effects };
}

export function statAlpha(state: LetterState): number {
  if (state.phase !== 'stat') return 0;
  if (state.elapsedMs < STAT_FADE_MS) return state.elapsedMs / STAT_FADE_MS;
  if (state.elapsedMs < STAT_FADE_MS + STAT_HOLD_MS) return 1;
  return Math.max(0, 1 - (state.elapsedMs - STAT_FADE_MS - STAT_HOLD_MS) / STAT_FADE_MS);
}
