import { describe, expect, it } from 'vitest';
import { computeJournalLayout } from '../../src/core/journal/journal-layout';
import { BURN_LINE_SAMPLE_COUNT, BURN_PAPER_STRIP_COUNT, createBurnGeometryBuffer, updateBurnGeometryInto } from '../../src/core/render/burn-geometry';

describe('燃信热路径性能冒烟', () => {
  it('完整燃烧 162 帧复用固定缓冲且采样数无增长', () => {
    const buffer = createBurnGeometryBuffer(); const line = buffer.lineY; const strips = buffer.stripOffsetY;
    for (let frame = 0; frame <= 162; frame += 1) updateBurnGeometryInto(buffer, { left: 60, top: 180, width: 280, height: 190 }, frame / 162, 7781);
    expect(buffer.lineY).toBe(line); expect(buffer.stripOffsetY).toBe(strips);
    expect(buffer.lineY.length).toBe(BURN_LINE_SAMPLE_COUNT); expect(buffer.stripOffsetY.length).toBe(BURN_PAPER_STRIP_COUNT);
  });

  it('500 条手帐滚动只布局可见行', () => {
    const layout = computeJournalLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }, 500, 8000);
    expect(layout.cells.length).toBeLessThan(40);
  });
});
