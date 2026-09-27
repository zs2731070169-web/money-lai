import { describe, expect, it } from 'vitest';
import {
  BEDTIME_CASH_DRAW_MOTION_PROFILE,
  CASH_BILL_LOGICAL_HEIGHT,
  CASH_DRAW_COMPLETE_THRESHOLD,
  DAYTIME_CASH_DRAW_MOTION_PROFILE,
  advanceCashDrawSession,
  createInitialCashDrawState,
} from '../../src/core/cash/draw-judgment';

/** 抽钞运动剖面单测（sleep-mode 规格「夜间交互剖面·更粘」，任务 1.2）：
 * 日间增益恒 1（行为零变化），夜间 0.75 增益使同样行程抽出更慢。 */

/** 抓取后单段拖拽，返回抽出比例 */
function draggedRatio(dragDeltaYPixels: number, profile?: typeof DAYTIME_CASH_DRAW_MOTION_PROFILE) {
  let update = advanceCashDrawSession(createInitialCashDrawState(), { type: 'grab' }, profile);
  update = advanceCashDrawSession(update.state, { type: 'drag', dragDeltaY: dragDeltaYPixels }, profile);
  return update.state.pulledOutRatio;
}

describe('抽钞运动剖面', () => {
  it('日间增益恒为 1（默认参数行为不变）', () => {
    expect(DAYTIME_CASH_DRAW_MOTION_PROFILE.dragGain).toBe(1);
    const withDefault = draggedRatio(CASH_BILL_LOGICAL_HEIGHT);
    const withExplicit = draggedRatio(CASH_BILL_LOGICAL_HEIGHT, DAYTIME_CASH_DRAW_MOTION_PROFILE);
    expect(withDefault).toBeCloseTo(1);
    expect(withExplicit).toBe(withDefault);
  });

  it('晚安剖面更粘：同样拖拽行程抽出比例更小但仍跟手（>0）', () => {
    const dayRatio = draggedRatio(CASH_BILL_LOGICAL_HEIGHT);
    const nightRatio = draggedRatio(CASH_BILL_LOGICAL_HEIGHT, BEDTIME_CASH_DRAW_MOTION_PROFILE);
    expect(nightRatio).toBeGreaterThan(0);
    expect(nightRatio).toBeLessThan(dayRatio);
    expect(nightRatio / dayRatio).toBeCloseTo(BEDTIME_CASH_DRAW_MOTION_PROFILE.dragGain);
  });

  it('完成边界随粘性外移：日间完成的行程夜间可能未过阈值而回收', () => {
    // 选一段使日间恰好过完成阈值、夜间 0.75 增益后低于阈值的行程
    const boundaryDragPx =
      (CASH_DRAW_COMPLETE_THRESHOLD / 1) * CASH_BILL_LOGICAL_HEIGHT * 1.2; // 日间 0.12 > 0.1
    const dayRatio = draggedRatio(boundaryDragPx);
    const nightRatio = draggedRatio(boundaryDragPx, BEDTIME_CASH_DRAW_MOTION_PROFILE);
    expect(dayRatio).toBeGreaterThanOrEqual(CASH_DRAW_COMPLETE_THRESHOLD);

    let dayRelease = advanceCashDrawSession(createInitialCashDrawState(), { type: 'grab' });
    dayRelease = advanceCashDrawSession(dayRelease.state, { type: 'drag', dragDeltaY: boundaryDragPx });
    dayRelease = advanceCashDrawSession(dayRelease.state, { type: 'release' });
    expect(dayRelease.state.phase).toBe('completing');

    let nightRelease = advanceCashDrawSession(
      createInitialCashDrawState(),
      { type: 'grab' },
      BEDTIME_CASH_DRAW_MOTION_PROFILE,
    );
    nightRelease = advanceCashDrawSession(
      nightRelease.state,
      { type: 'drag', dragDeltaY: boundaryDragPx },
      BEDTIME_CASH_DRAW_MOTION_PROFILE,
    );
    nightRelease = advanceCashDrawSession(
      nightRelease.state,
      { type: 'release' },
      BEDTIME_CASH_DRAW_MOTION_PROFILE,
    );
    // 夜间同行程未达阈值 → 回收不计计数（更粘 = 需要更长手指行程完成）
    expect(nightRatio).toBeLessThan(CASH_DRAW_COMPLETE_THRESHOLD);
    expect(nightRelease.state.phase).toBe('recycling');
    expect(nightRelease.effects.map((effect) => effect.type)).toContain('bill-recycle-began');
  });
});
