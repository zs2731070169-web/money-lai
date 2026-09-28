import { describe, expect, it } from 'vitest';
import { computeJournalExportPlan, EXPORT_MAX_DIMENSION, EXPORT_MAX_PIXELS, paintJournalExport } from '../../src/core/journal/export';

describe('手帐长图导出', () => {
  it('500 条记录按像素预算缩放且不超上限', () => {
    const plan = computeJournalExportPlan(500);
    expect(plan.width * plan.height).toBeLessThanOrEqual(EXPORT_MAX_PIXELS);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(EXPORT_MAX_DIMENSION);
    expect(plan.scale).toBeLessThan(1);
    expect(plan.chunkCount).toBeGreaterThan(1);
    expect(plan.chunkHeight * plan.chunkCount).toBeGreaterThanOrEqual(plan.height);
  });

  it('画师只绘制图案、日期与本机说明，不绘制隐藏原文', () => {
    const texts: string[] = [];
    const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
      get(_target, property) {
        if (property === 'fillText') return (text: string) => texts.push(text);
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
        if (property === 'measureText') return () => ({ width: 20 });
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const plan = computeJournalExportPlan(1);
    paintJournalExport(context, [{ id: 'x', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '绝不导出的原文' }], plan);
    expect(texts).toContain('这些东西只在这台设备上。');
    expect(texts).toContain('2026-09-28');
    expect(texts).not.toContain('绝不导出的原文');
  });
});
