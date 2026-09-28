import { describe, expect, it } from 'vitest';
import { BURN_LINE_SAMPLE_COUNT, BURN_PAPER_STRIP_COUNT, createBurnGeometryBuffer, updateBurnGeometryInto } from '../../src/core/render/burn-geometry';

describe('固定采样燃烧几何', () => {
  const rect = { left: 20, top: 40, width: 280, height: 180 };
  it('采样与纸带数量固定，进度从上到下单调', () => {
    const buffer = createBurnGeometryBuffer();
    expect(buffer.lineX.length).toBe(BURN_LINE_SAMPLE_COUNT);
    expect(buffer.stripOffsetX.length).toBe(BURN_PAPER_STRIP_COUNT);
    updateBurnGeometryInto(buffer, rect, 0, 81); const startMean = buffer.lineY.reduce((sum, y) => sum + y, 0) / buffer.lineY.length;
    updateBurnGeometryInto(buffer, rect, 0.5, 81); const middleMean = buffer.lineY.reduce((sum, y) => sum + y, 0) / buffer.lineY.length;
    updateBurnGeometryInto(buffer, rect, 1, 81); const endMean = buffer.lineY.reduce((sum, y) => sum + y, 0) / buffer.lineY.length;
    expect(startMean).toBeLessThan(middleMean); expect(middleMean).toBeLessThan(endMean);
    expect([...buffer.lineY].every((y) => y >= rect.top && y <= rect.top + rect.height)).toBe(true);
  });

  it('同一进度和种子跨帧稳定并复用原缓冲', () => {
    const buffer = createBurnGeometryBuffer();
    expect(updateBurnGeometryInto(buffer, rect, 0.44, 92)).toBe(buffer);
    const snapshot = [...buffer.lineY];
    updateBurnGeometryInto(buffer, rect, 0.44, 92);
    expect([...buffer.lineY]).toEqual(snapshot);
  });
});

