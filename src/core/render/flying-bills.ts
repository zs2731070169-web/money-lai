/**
 * 飘落/升腾纸钞的运动推进（纯函数，worry-release 任务 3.3）：
 * 原有 follow-through 上飘淡出行为逐字段保持不变；新增 ascend 升腾运动
 * （向上初速 + 水平漂移 + 可延时淡出——心事钞多留半拍）。
 */

import { FlyingBillView } from './bill-painter';

/** follow-through 上飘淡出时长（毫秒） */
export const FLYING_BILL_DURATION_MS = 850;
/** 减弱动态下的短时长（快速淡出，保留状态变化可感知） */
export const FLYING_BILL_REDUCED_DURATION_MS = 220;
/** follow-through 上飘行程（逻辑像素） */
export const FLYING_BILL_RISE_PIXELS = 74;
/** 透明度低于此值移除 */
export const FLYING_BILL_ALPHA_CUTOFF = 0.02;
/** 升腾淡出时长（毫秒）：升腾行程更长，淡出随之更缓 */
export const ASCEND_FADE_DURATION_MS = 1_100;
/** 升腾向上初速默认（逻辑像素/秒） */
export const ASCEND_VELOCITY_UP_PIXELS_PER_SECOND = 260;
/** 升腾水平漂移幅度基准（逻辑像素/秒，生成时按张序在 ±区间内取值） */
export const ASCEND_DRIFT_X_MAX_PIXELS_PER_SECOND = 46;

export interface AdvanceFlyingBillsParameters {
  /** 系统级减弱动态：全部运动收敛为短时长快速淡出 */
  reducedMotion: boolean;
}

/**
 * 推进一帧：返回新数组（淡尽条目被移除），不改入参。
 * 原行为（无 ascend 字段）与既有实现逐字段一致：
 * y -= (deltaMs/durationMs)*RISE；alpha -= deltaMs/durationMs；alpha ≤ 0.02 移除。
 */
export function advanceFlyingBills(
  flyingBills: FlyingBillView[],
  deltaMs: number,
  parameters: AdvanceFlyingBillsParameters,
): FlyingBillView[] {
  const driftUpDurationMs = parameters.reducedMotion
    ? FLYING_BILL_REDUCED_DURATION_MS
    : FLYING_BILL_DURATION_MS;
  const ascendDurationMs = parameters.reducedMotion
    ? FLYING_BILL_REDUCED_DURATION_MS
    : ASCEND_FADE_DURATION_MS;

  const nextBills: FlyingBillView[] = [];
  for (const flyingBill of flyingBills) {
    let nextX = flyingBill.x;
    let nextY = flyingBill.y;
    let nextAlpha = flyingBill.alpha;
    let nextAscend = flyingBill.ascend;
    if (flyingBill.ascend) {
      // 升腾：向上初速 + 水平漂移；淡出在 fadeDelayMs 耗尽后才开始（延时期间不衰减）
      nextY = flyingBill.y - (flyingBill.ascend.velocityUpPixelsPerSecond * deltaMs) / 1_000;
      nextX = flyingBill.x + (flyingBill.ascend.driftXPixelsPerSecond * deltaMs) / 1_000;
      let fadeDeltaMs = deltaMs;
      let remainingDelayMs = flyingBill.ascend.fadeDelayMs;
      if (remainingDelayMs > 0) {
        const consumedDelayMs = Math.min(remainingDelayMs, deltaMs);
        remainingDelayMs -= consumedDelayMs;
        fadeDeltaMs = deltaMs - consumedDelayMs;
      }
      nextAlpha =
        fadeDeltaMs > 0
          ? Math.max(0, flyingBill.alpha - fadeDeltaMs / ascendDurationMs)
          : flyingBill.alpha;
      nextAscend = { ...flyingBill.ascend, fadeDelayMs: remainingDelayMs };
    } else {
      // 原有 follow-through 上飘淡出（逐字段保持既有行为）
      nextY = flyingBill.y - (deltaMs / driftUpDurationMs) * FLYING_BILL_RISE_PIXELS;
      nextAlpha = Math.max(0, flyingBill.alpha - deltaMs / driftUpDurationMs);
    }
    if (nextAlpha > FLYING_BILL_ALPHA_CUTOFF) {
      nextBills.push({ ...flyingBill, x: nextX, y: nextY, alpha: nextAlpha, ascend: nextAscend });
    }
  }
  return nextBills;
}
