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
  it('日间增益为 0.75（daytime-comfort：与晚安一致的更粘跟手）', () => {
    expect(DAYTIME_CASH_DRAW_MOTION_PROFILE.dragGain).toBe(0.75);
    const withDefault = draggedRatio(CASH_BILL_LOGICAL_HEIGHT);
    const withExplicit = draggedRatio(CASH_BILL_LOGICAL_HEIGHT, DAYTIME_CASH_DRAW_MOTION_PROFILE);
    expect(withDefault).toBeCloseTo(0.75);
    expect(withExplicit).toBe(withDefault);
  });

  it('晚安剖面与日间同粘：同样拖拽行程抽出比例一致（daytime-comfort 对齐）', () => {
    const dayRatio = draggedRatio(CASH_BILL_LOGICAL_HEIGHT);
    const nightRatio = draggedRatio(CASH_BILL_LOGICAL_HEIGHT, BEDTIME_CASH_DRAW_MOTION_PROFILE);
    expect(nightRatio).toBeGreaterThan(0);
    expect(nightRatio).toBeCloseTo(dayRatio);
    expect(BEDTIME_CASH_DRAW_MOTION_PROFILE.dragGain).toBe(DAYTIME_CASH_DRAW_MOTION_PROFILE.dragGain);
  });

  it('完成边界两剖面一致：同行程两剖面同判（对齐后无外移）', () => {
    // 选一段恰好越过完成阈值的行程：两剖面（同增益）都完成
    const boundaryDragPx =
      (CASH_DRAW_COMPLETE_THRESHOLD / DAYTIME_CASH_DRAW_MOTION_PROFILE.dragGain) *
      CASH_BILL_LOGICAL_HEIGHT *
      1.2;
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
    expect(nightRatio).toBeCloseTo(dayRatio);
    expect(nightRelease.state.phase).toBe('completing');
  });
});
