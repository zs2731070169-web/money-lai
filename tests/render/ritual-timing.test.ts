import { describe, expect, it } from 'vitest';
import { afterglowVisual, createBurningState, statAlpha } from '../../src/core/letter/burning-state';

describe('余光与统计视觉时序', () => {
  it('余光停留 0.2s 后半径单调增大、alpha 单调归零', () => {
    const samples = [0, 200, 400, 600, 800].map((elapsedMs) => afterglowVisual({ ...createBurningState(), phase: 'fade', elapsedMs }));
    expect(samples[0].alpha).toBe(samples[1].alpha);
    expect(samples.map((sample) => sample.alpha)).toEqual([...samples.map((sample) => sample.alpha)].sort((a, b) => b - a));
    expect(samples.map((sample) => sample.radiusRatio)).toEqual([...samples.map((sample) => sample.radiusRatio)].sort((a, b) => a - b));
    expect(samples[4].alpha).toBe(0);
  });

  it('统计按 0.6s 淡入、1.8s 停留、0.6s 淡出', () => {
    const alphaAt = (elapsedMs: number) => statAlpha({ ...createBurningState(), phase: 'stat', elapsedMs });
    expect(alphaAt(0)).toBe(0); expect(alphaAt(600)).toBe(1); expect(alphaAt(2400)).toBe(1); expect(alphaAt(3000)).toBe(0);
  });
});

