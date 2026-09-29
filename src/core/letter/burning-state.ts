/**
 * 心里话倾诉主循环状态机（历史名 burning-state 沿用，能力见 letter-burning→倾诉改造）。
 * 完成语义：书写「确认」后信纸折回入袋（settle），落库结算在收好动画结束触发；
 * 取消则停在展示位（back）可再编辑。燃烧/甩出链路已随产品转向移除。
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
export const MAX_FRAME_DELTA_MS = 100;
export const MAX_LETTER_TEXT_LENGTH = 400;

export type BurningPhase = 'idle' | 'draw' | 'unfold' | 'edit' | 'edit-return' | 'back' | 'settle' | 'quiet' | 'stat';
export type BurningEffect = 'drawn' | 'requestEdit' | 'save' | 'reset';

export interface BurningState {
  phase: BurningPhase;
  elapsedMs: number;
  pointerId: number | null;
  gestureStartY: number;
  gestureStartMs: number;
  lastY: number;
  lastMs: number;
  offsetY: number;
  tiltDegrees: number;
  text: string;
  count: number | null;
  wantsStat: boolean;
  /** 确认触发：回缩动画结束后进入收好而非停留在展示位。 */
  pendingSettle: boolean;
}

export interface BurningUpdate {
  state: BurningState;
  effects: BurningEffect[];
}

export function createBurningState(): BurningState {
  return {
    phase: 'idle', elapsedMs: 0, pointerId: null, gestureStartY: 0, gestureStartMs: 0,
    lastY: 0, lastMs: 0, offsetY: 0, tiltDegrees: 0, text: '', count: null, wantsStat: false, pendingSettle: false,
  };
}

export function beginDraw(state: BurningState, pointerId: number, y: number, atMs: number): BurningState {
  if (state.phase !== 'idle') return state;
  return { ...state, phase: 'draw', pointerId, gestureStartY: y, gestureStartMs: atMs, lastY: y, lastMs: atMs };
}

export function movePointer(state: BurningState, pointerId: number, y: number, atMs: number): BurningState {
  if (state.pointerId !== pointerId || state.phase !== 'draw') return state;
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

export function beginEditing(state: BurningState): BurningState {
  if (state.phase !== 'back') return state;
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

/**
 * 退出编辑：willSettle 表示本次为「确认」——回缩动画结束后折回入袋；
 * wantsStat 由编排层按统计节奏预先计算并随收好携带。
 */
export function finishEditing(state: BurningState, willSettle = false, wantsStat = false): BurningState {
  return state.phase === 'edit'
    ? { ...state, phase: 'edit-return', elapsedMs: 0, pointerId: null, offsetY: 0, tiltDegrees: 0, pendingSettle: willSettle, wantsStat: willSettle ? wantsStat : state.wantsStat }
    : state;
}

export function resolveCount(state: BurningState, count: number | null): BurningState {
  return { ...state, count };
}

export function advanceBurningState(state: BurningState, deltaMs: number, reducedMotion = false): BurningUpdate {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return { state, effects: [] };
  if (!['unfold', 'edit', 'edit-return', 'settle', 'quiet', 'stat'].includes(state.phase)) return { state, effects: [] };
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
    if (current.phase === 'edit-return') {
      const durationMs = reducedMotion ? REDUCED_EDIT_RETURN_DURATION_MS : EDIT_RETURN_DURATION_MS;
      const consumedMs = Math.min(remainingMs, durationMs - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < durationMs) { current = { ...current, elapsedMs }; break; }
      // 确认路径折回入袋，取消路径停在展示位等待再编辑
      current = { ...current, phase: current.pendingSettle ? 'settle' : 'back', elapsedMs: 0, offsetY: 0, tiltDegrees: 0 };
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
      current = createBurningState(); effects.push('reset'); break;
    }
    if (current.phase === 'quiet') {
      const consumedMs = Math.min(remainingMs, QUIET_DURATION_MS - current.elapsedMs);
      const elapsedMs = current.elapsedMs + consumedMs;
      remainingMs -= consumedMs;
      if (elapsedMs < QUIET_DURATION_MS) { current = { ...current, elapsedMs }; break; }
      // 计数已返回且本次满足节奏才显示统计句，否则静默复位（离线降级）
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

export function statAlpha(state: BurningState): number {
  if (state.phase !== 'stat') return 0;
  if (state.elapsedMs < STAT_FADE_MS) return state.elapsedMs / STAT_FADE_MS;
  if (state.elapsedMs < STAT_FADE_MS + STAT_HOLD_MS) return 1;
  return Math.max(0, 1 - (state.elapsedMs - STAT_FADE_MS - STAT_HOLD_MS) / STAT_FADE_MS);
}
