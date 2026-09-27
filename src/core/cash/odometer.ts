/**
 * 金额里程表（cash-drawing 规格「金额累计反馈」）：
 * 累计金额为唯一主指标，按位滚动 + 错峰启动 + 微弹，等宽数字不抖动。
 */

/** 单个数字位的滚动时长（ms） */
export const ODOMETER_DIGIT_ROLL_DURATION_MS = 380;

/** 相邻位错峰启动间隔（ms） */
export const ODOMETER_DIGIT_STAGGER_MS = 40;

export interface OdometerDigitCell {
  /** 从哪个数字滚起 */
  startDigit: number;
  /** 滚到哪个数字 */
  targetDigit: number;
  /** 滚动进度 0~1 */
  rollProgress: number;
}

export interface AmountOdometerState {
  targetTotal: number;
  /** 上次更新金额后经过的时间（ms），驱动错峰与微弹 */
  elapsedSinceUpdateMs: number;
  /** 当前位数的数字单元（从高位到低位） */
  digitCells: OdometerDigitCell[];
  /** 微弹缩放（1.0~峰值） */
  popScale: number;
}

/** 微弹峰值缩放（规格：每张微弹一次） */
export const ODOMETER_POP_SCALE_PEAK = 1.06;

/** 微弹回落时长（ms）：从峰值线性回到 1.0 */
const ODOMETER_POP_DECAY_MS = 300;

/** 十进制逐位拆解（高位在前）：1234 → [1,2,3,4] */
function decimalDigits(value: number): number[] {
  return Array.from(String(Math.max(0, Math.round(value))), (character) =>
    Number.parseInt(character, 10),
  );
}

export function createAmountOdometerState(initialTotal: number): AmountOdometerState {
  const initialDigits = decimalDigits(initialTotal);
  return {
    targetTotal: initialTotal,
    elapsedSinceUpdateMs: Number.POSITIVE_INFINITY,
    digitCells: initialDigits.map((digit) => ({
      startDigit: digit,
      targetDigit: digit,
      rollProgress: 1,
    })),
    popScale: 1,
  };
}

export function enqueueAmountOdometerTarget(
  state: AmountOdometerState,
  newTotal: number,
): AmountOdometerState {
  if (newTotal === state.targetTotal) {
    return state;
  }

  // 从「当前显示目标」滚向新目标；位数为两者较大值（等宽不抖动：滚动期间位数恒定）
  const previousDigits = decimalDigits(state.targetTotal);
  const targetDigits = decimalDigits(newTotal);
  const cellCount = Math.max(previousDigits.length, targetDigits.length);

  const digitCells: OdometerDigitCell[] = [];
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const previousDigit = previousDigits[previousDigits.length - cellCount + cellIndex] ?? 0;
    const targetDigit = targetDigits[targetDigits.length - cellCount + cellIndex] ?? 0;
    digitCells.push({ startDigit: previousDigit, targetDigit, rollProgress: 0 });
  }

  return {
    targetTotal: newTotal,
    elapsedSinceUpdateMs: 0,
    digitCells,
    popScale: ODOMETER_POP_SCALE_PEAK,
  };
}

/** 由经过时间推导某位的滚动进度：低位先启动、逐位错峰（delay = 该位到个位的距离 × stagger） */
function rollProgressForCell(
  elapsedSinceUpdateMs: number,
  cellCount: number,
  cellIndexFromHigh: number,
): number {
  const distanceFromUnitsDigit = cellCount - 1 - cellIndexFromHigh;
  const startDelayMs = distanceFromUnitsDigit * ODOMETER_DIGIT_STAGGER_MS;
  const activeMs = elapsedSinceUpdateMs - startDelayMs;
  if (activeMs <= 0) return 0;
  return Math.min(1, activeMs / ODOMETER_DIGIT_ROLL_DURATION_MS);
}

export function advanceAmountOdometer(
  state: AmountOdometerState,
  deltaMilliseconds: number,
): AmountOdometerState {
  const elapsedSinceUpdateMs = state.elapsedSinceUpdateMs + deltaMilliseconds;
  const cellCount = state.digitCells.length;
  const settled =
    elapsedSinceUpdateMs >=
    ODOMETER_DIGIT_ROLL_DURATION_MS + ODOMETER_DIGIT_STAGGER_MS * (cellCount - 1);

  const popDecayRatio = Math.max(0, 1 - elapsedSinceUpdateMs / ODOMETER_POP_DECAY_MS);

  return {
    ...state,
    elapsedSinceUpdateMs,
    digitCells: state.digitCells.map((cell, cellIndexFromHigh) => ({
      ...cell,
      rollProgress: settled
        ? 1
        : rollProgressForCell(elapsedSinceUpdateMs, cellCount, cellIndexFromHigh),
    })),
    popScale: 1 + (ODOMETER_POP_SCALE_PEAK - 1) * popDecayRatio,
  };
}

/** 金额显示格式化：千分位分组（1240 → 1,240）；金额为整数（面值均为整数） */
export function formatAmountWithGrouping(total: number): string {
  return String(Math.max(0, Math.round(total))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );
}
