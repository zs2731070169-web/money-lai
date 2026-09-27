import { describe, expect, it } from 'vitest';
import { FlyingBillView } from '../../src/core/render/bill-painter';
import {
  ASCEND_FADE_DURATION_MS,
  FLYING_BILL_DURATION_MS,
  advanceFlyingBills,
} from '../../src/core/render/flying-bills';

/** 升腾运动推进单测（worry-release 任务 3.3）：原 follow-through 行为不变 + 升腾扩展。 */

function buildDriftUpBill(): FlyingBillView {
  return {
    x: 100,
    y: 500,
    rotationDegrees: 0,
    alpha: 1,
    width: 60,
    height: 30,
    denominationId: 'denomination-1',
  };
}

function buildAscendBill(fadeDelayMs = 0, worryText?: string): FlyingBillView {
  return {
    x: 200,
    y: 400,
    rotationDegrees: -4,
    alpha: 1,
    width: 60,
    height: 30,
    denominationId: 'denomination-1',
    ascend: { velocityUpPixelsPerSecond: 260, driftXPixelsPerSecond: 30, fadeDelayMs },
    worryText,
  };
}

describe('原有 follow-through 行为（逐字段不变）', () => {
  it('上飘与淡出按既有公式推进，淡尽移除', () => {
    const nextBills = advanceFlyingBills([buildDriftUpBill()], 100, { reducedMotion: false });
    expect(nextBills).toHaveLength(1);
    expect(nextBills[0].y).toBeCloseTo(500 - (100 / FLYING_BILL_DURATION_MS) * 74);
    expect(nextBills[0].alpha).toBeCloseTo(1 - 100 / FLYING_BILL_DURATION_MS);
    // 推进到淡尽
    let bills = [buildDriftUpBill()];
    for (let stepIndex = 0; stepIndex < 12; stepIndex += 1) {
      bills = advanceFlyingBills(bills, 100, { reducedMotion: false });
    }
    expect(bills).toHaveLength(0);
  });

  it('不改入参（返回新数组新对象）', () => {
    const original = buildDriftUpBill();
    advanceFlyingBills([original], 100, { reducedMotion: false });
    expect(original.y).toBe(500);
    expect(original.alpha).toBe(1);
  });
});

describe('升腾运动（ascend）', () => {
  it('向上初速 + 水平漂移，无延时时立即淡出', () => {
    const nextBills = advanceFlyingBills([buildAscendBill()], 100, { reducedMotion: false });
    expect(nextBills[0].y).toBeCloseTo(400 - 26);
    expect(nextBills[0].x).toBeCloseTo(200 + 3);
    expect(nextBills[0].alpha).toBeCloseTo(1 - 100 / ASCEND_FADE_DURATION_MS);
  });

  it('心事钞延时半拍：延时期间 alpha 不衰减、普通纸钞已开始淡出', () => {
    const [worryBill] = advanceFlyingBills([buildAscendBill(400, '房贷')], 200, {
      reducedMotion: false,
    });
    expect(worryBill.alpha).toBe(1);
    expect(worryBill.ascend?.fadeDelayMs).toBe(200);
    const [normalBill] = advanceFlyingBills([buildAscendBill()], 200, { reducedMotion: false });
    expect(normalBill.alpha).toBeLessThan(1);
  });

  it('延时跨帧消耗：400ms 延时分两帧耗尽后开始淡出', () => {
    let bills = [buildAscendBill(400, '汇报')];
    bills = advanceFlyingBills(bills, 250, { reducedMotion: false });
    expect(bills[0].alpha).toBe(1); // 仍处于延时窗口
    bills = advanceFlyingBills(bills, 250, { reducedMotion: false }); // 剩 150ms 延时 → 本帧 100ms 淡出
    expect(bills[0].alpha).toBeCloseTo(1 - 100 / ASCEND_FADE_DURATION_MS);
    expect(bills[0].ascend?.fadeDelayMs).toBe(0);
  });

  it('同一帧内升腾纸钞单调上移、心事钞永远晚于普通钞淡尽', () => {
    let bills = [buildAscendBill(0), buildAscendBill(400, '心事')];
    const previousY = bills.map((bill) => bill.y);
    bills = advanceFlyingBills(bills, 100, { reducedMotion: false });
    bills.forEach((bill, index) => expect(bill.y).toBeLessThan(previousY[index]));
    // 推进至普通钞淡尽
    for (let stepIndex = 0; stepIndex < 12; stepIndex += 1) {
      bills = advanceFlyingBills(bills, 100, { reducedMotion: false });
    }
    expect(bills).toHaveLength(1);
    expect(bills[0].worryText).toBe('心事');
  });

  it('减弱动态：升腾收敛为短时长快速淡出（状态变化可感知）', () => {
    let bills = [buildAscendBill(0)];
    for (let stepIndex = 0; stepIndex < 4; stepIndex += 1) {
      bills = advanceFlyingBills(bills, 100, { reducedMotion: true });
    }
    expect(bills).toHaveLength(0);
  });
});
