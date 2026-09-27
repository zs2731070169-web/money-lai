/**
 * 睡眠弧线状态机（sleep-mode 规格「渐进熄灭」）：晚安会话的熄灭时序纯函数。
 *
 * 时序：最后交互 → 静置熄灭阈值（约 90s）→ 渐暗（约 60s）→ 近黑稳态（入睡点，封存恰一次）。
 * 全部时点由外部注入的单调时钟推算，不依赖实时计时器——锁屏/后台计时器冻结后，
 * 回前台一次 advance 即可补判到位（直接跳到目标相位）；封存以 sealed 标记幂等。
 * 亮度恢复的「数秒温和过渡」由渲染层按相位差值渐变完成，本状态机只给出目标值。
 */

/** 静置熄灭阈值（ms）：最后一次交互后静置此时长开始渐暗 */
export const SLEEP_DIM_IDLE_THRESHOLD_MS = 90_000;

/** 渐暗时长（ms）：夜间基准亮度线性渐变到近黑 */
export const SLEEP_DIM_FADE_DURATION_MS = 60_000;

/** 夜间基准亮度系数（相对夜间视觉基调，idle 稳态值） */
export const SLEEP_NIGHT_BASE_BRIGHTNESS = 1;

/** 近黑亮度系数：渐暗终点——保留微弱「还在」的余量而非绝对全黑 */
export const SLEEP_NEAR_BLACK_BRIGHTNESS = 0.02;

export type SleepArcPhase = 'idle' | 'dimming' | 'dimmed';

export interface SleepArcState {
  /** 当前相位：idle=计时中 dimming=渐暗中 dimmed=近黑稳态 */
  phase: SleepArcPhase;
  /** 最后一次交互的单调时点（ms） */
  lastInteractionAtMs: number;
  /** 本夜是否已封存（幂等：重复推进/回前台补判不重复发射 reachedSleepPoint） */
  sealed: boolean;
}

export type SleepArcEvent =
  /** 用户交互（抽钞/开合）或熄灭后的唤醒触摸：恢复基准亮度并重新计时，不退出晚安模式 */
  | { type: 'interaction'; nowMs: number }
  /** 时间推进：按（now − 最后交互）推算相位与亮度，可跨阈值一次跳变 */
  | { type: 'advance'; nowMs: number };

export interface SleepArcUpdate {
  state: SleepArcState;
  /** 目标亮度系数（0~1，相对夜间基准；渲染层负责数秒级温和过渡） */
  brightness: number;
  /** 本更新恰好首次到达入睡点（消费方据此封存本夜记录，恰一次） */
  reachedSleepPoint: boolean;
}

export function createInitialSleepArcState(nowMs: number): SleepArcState {
  return { phase: 'idle', lastInteractionAtMs: nowMs, sealed: false };
}

/** 按静置时长推算相位（跨阈值一次跳变同样成立） */
function resolvePhaseForIdleDuration(idleDurationMs: number): SleepArcPhase {
  if (idleDurationMs >= SLEEP_DIM_IDLE_THRESHOLD_MS + SLEEP_DIM_FADE_DURATION_MS) {
    return 'dimmed';
  }
  if (idleDurationMs >= SLEEP_DIM_IDLE_THRESHOLD_MS) {
    return 'dimming';
  }
  return 'idle';
}

/** 渐暗亮度：阈值后 60s 内自基准线性降至近黑 */
function resolveBrightnessForIdleDuration(idleDurationMs: number): number {
  const fadeElapsedMs = Math.max(0, idleDurationMs - SLEEP_DIM_IDLE_THRESHOLD_MS);
  const fadeProgress = Math.min(1, fadeElapsedMs / SLEEP_DIM_FADE_DURATION_MS);
  return (
    SLEEP_NIGHT_BASE_BRIGHTNESS * (1 - fadeProgress) + SLEEP_NEAR_BLACK_BRIGHTNESS * fadeProgress
  );
}

export function advanceSleepArc(state: SleepArcState, event: SleepArcEvent): SleepArcUpdate {
  switch (event.type) {
    case 'interaction': {
      // 熄灭中/后的触摸或正常交互：恢复基准、重新计时（sealed 保持——同夜只封存一次）
      return {
        state: { ...state, phase: 'idle', lastInteractionAtMs: event.nowMs },
        brightness: SLEEP_NIGHT_BASE_BRIGHTNESS,
        reachedSleepPoint: false,
      };
    }
    case 'advance': {
      const idleDurationMs = Math.max(0, event.nowMs - state.lastInteractionAtMs);
      const nextPhase = resolvePhaseForIdleDuration(idleDurationMs);
      const brightness = resolveBrightnessForIdleDuration(idleDurationMs);
      // 入睡点 = 首次到达 dimmed；sealed 幂等保证计时器冻结后的补判也不重复封存
      const reachedSleepPoint = nextPhase === 'dimmed' && !state.sealed;
      return {
        state: { ...state, phase: nextPhase, sealed: state.sealed || reachedSleepPoint },
        brightness,
        reachedSleepPoint,
      };
    }
  }
}
