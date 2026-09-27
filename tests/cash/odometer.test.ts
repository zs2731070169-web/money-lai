import { describe, expect, it } from 'vitest';
import {
  ODOMETER_DIGIT_ROLL_DURATION_MS,
  ODOMETER_DIGIT_STAGGER_MS,
  advanceAmountOdometer,
  createAmountOdometerState,
  enqueueAmountOdometerTarget,
  formatAmountWithGrouping,
} from '../../src/core/cash/odometer';

/**
 * 金额里程表单测（任务 3.3 验证入口，对应 cash-drawing 规格「金额累计反馈」）：
 * 按位滚动、错峰时长、等宽不抖动（金额为唯一主指标）、微弹效果。
 */

describe('金额格式化', () => {
  it('千分位分组：1240 → 1,240', () => {
    expect(formatAmountWithGrouping(1240)).toBe('1,240');
  });

  it('小于 1000 不分组，0 显示为 0', () => {
    expect(formatAmountWithGrouping(985)).toBe('985');
    expect(formatAmountWithGrouping(0)).toBe('0');
  });

  it('大数值分组正确', () => {
    expect(formatAmountWithGrouping(1234567)).toBe('1,234,567');
  });
});

describe('里程表滚动', () => {
  it('enqueue 新金额 → 进入微弹峰值并更新目标（每张微弹，规格）', () => {
    const initialState = createAmountOdometerState(1000);
    const enqueuedState = enqueueAmountOdometerTarget(initialState, 1005);
    expect(enqueuedState.targetTotal).toBe(1005);
    expect(enqueuedState.popScale).toBeCloseTo(1.06, 5);
  });

  it('enqueue 相同金额 → 状态原样返回（静默）', () => {
    const initialState = createAmountOdometerState(1000);
    expect(enqueueAmountOdometerTarget(initialState, 1000)).toBe(initialState);
  });

  it('滚动期间数字位数恒定（等宽不抖动：位数为 max(旧,新)）', () => {
    // 999 → 1005：位数从 3 变 4，滚动期间 cells 固定为 4 位（首位从 0 滚入）
    const initialState = createAmountOdometerState(999);
    const enqueuedState = enqueueAmountOdometerTarget(initialState, 1005);
    const cellCountDuringRoll = enqueuedState.digitCells.length;
    const advancedState = advanceAmountOdometer(enqueuedState, 10);
    expect(advancedState.digitCells.length).toBe(cellCountDuringRoll);
    expect(cellCountDuringRoll).toBe(4);
  });

  it('错峰：个位先动，高位按 stagger 延迟启动', () => {
    const initialState = createAmountOdometerState(1000);
    const enqueuedState = enqueueAmountOdometerTarget(initialState, 1234);
    // 千位（第 4 位）的启动延迟 = 3 × stagger = 120ms；取 115ms：千位未启动、个位已滚动
    const justBeforeHighestDigitStarts = ODOMETER_DIGIT_STAGGER_MS * 3 - 5;
    const advancedState = advanceAmountOdometer(
      enqueuedState,
      justBeforeHighestDigitStarts,
    );
    const [thousandsDigit, , , unitsDigit] = advancedState.digitCells;
    expect(unitsDigit.rollProgress).toBeGreaterThan(0); // 个位已滚动
    expect(thousandsDigit.rollProgress).toBe(0); // 最高位尚未启动
  });

  it('充分时间后全部位收敛到目标值', () => {
    const initialState = createAmountOdometerState(1000);
    const enqueuedState = enqueueAmountOdometerTarget(initialState, 1234);
    const advancedState = advanceAmountOdometer(
      enqueuedState,
      ODOMETER_DIGIT_ROLL_DURATION_MS + ODOMETER_DIGIT_STAGGER_MS * 4 + 50,
    );
    expect(
      advancedState.digitCells.map((cell) => cell.targetDigit).join(''),
    ).toBe('1234');
    expect(
      advancedState.digitCells.every((cell) => cell.rollProgress === 1),
    ).toBe(true);
  });

  it('微弹缩放随时间回落（1.06 → 1）', () => {
    const initialState = createAmountOdometerState(1000);
    const enqueuedState = enqueueAmountOdometerTarget(initialState, 1005);
    const earlyState = advanceAmountOdometer(enqueuedState, 30);
    const lateState = advanceAmountOdometer(enqueuedState, 600);
    expect(earlyState.popScale).toBeGreaterThan(1.02);
    expect(lateState.popScale).toBe(1);
  });
});
