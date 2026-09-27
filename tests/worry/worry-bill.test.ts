import { describe, expect, it } from 'vitest';
import {
  WORRY_BILL_FADE_EXTRA_DELAY_SECONDS,
  WORRY_BILL_FACE_VALUE,
  WORRY_TEXT_MAX_LENGTH,
  applyWorryBillCompletion,
  isValidWorryText,
  resolveAscensionBillPlan,
} from '../../src/core/worry/worry-bill';

/** 心事钞语义单测（worry-release「心事钞」+ cash-drawing 面额例外，任务 1.2/1.3）。 */

describe('心事钞计数语义', () => {
  it('面额恒为 ¥0；抽出计张不计额', () => {
    expect(WORRY_BILL_FACE_VALUE).toBe(0);
    const next = applyWorryBillCompletion({ sessionAmount: 1_240, sessionCount: 37 });
    expect(next.sessionCount).toBe(38);
    expect(next.sessionAmount).toBe(1_240);
  });
});

describe('心事文本合法性', () => {
  it('非空且 ≤30 字（去首尾空白）', () => {
    expect(isValidWorryText('')).toBe(false);
    expect(isValidWorryText('   ')).toBe(false);
    expect(isValidWorryText('周一汇报')).toBe(true);
    expect(isValidWorryText('　'.repeat(WORRY_TEXT_MAX_LENGTH))).toBe(false);
    expect(isValidWorryText('好'.repeat(WORRY_TEXT_MAX_LENGTH))).toBe(true);
    expect(isValidWorryText('好'.repeat(WORRY_TEXT_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('升腾纸钞规划', () => {
  it('小额：下限 6 张保手感', () => {
    const plan = resolveAscensionBillPlan(5, []);
    expect(plan.scatterBillCount).toBe(6);
  });

  it('巨额：上限 36 张保帧预算', () => {
    const plan = resolveAscensionBillPlan(1_000_000, []);
    expect(plan.scatterBillCount).toBe(36);
  });

  it('心事钞逐张在场（各自延时淡出参数由渲染层消费）', () => {
    const plan = resolveAscensionBillPlan(300, [
      { text: '房贷' },
      { text: '汇报' },
    ]);
    expect(plan.worryBillCount).toBe(2);
    expect(plan.scatterBillCount).toBeGreaterThanOrEqual(6);
    expect(WORRY_BILL_FADE_EXTRA_DELAY_SECONDS).toBeGreaterThan(0);
  });
});
