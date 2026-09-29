import { describe, expect, it } from 'vitest';
import { QUIET_DURATION_MS, SETTLE_DURATION_MS, STAT_DURATION_MS, createBurningState, statAlpha } from '../../src/core/letter/burning-state';

describe('收好与统计视觉时序', () => {
  it('收好 450ms、安静等待 1500ms、统计 0.6/1.8/0.6s 时长锁定', () => {
    expect(SETTLE_DURATION_MS).toBe(450);
    expect(QUIET_DURATION_MS).toBe(1500);
    expect(STAT_DURATION_MS).toBe(3000);
  });

  it('统计按 0.6s 淡入、1.8s 停留、0.6s 淡出', () => {
    const alphaAt = (elapsedMs: number) => statAlpha({ ...createBurningState(), phase: 'stat', elapsedMs });
    expect(alphaAt(0)).toBe(0); expect(alphaAt(600)).toBe(1); expect(alphaAt(2400)).toBe(1); expect(alphaAt(3000)).toBe(0);
  });
});
