import { describe, expect, it } from 'vitest';
import { computeJournalLayout } from '../../src/core/journal/journal-layout';

describe('手帐虚拟网格', () => {
  it('500 条记录只生成视口附近单元并保持正序索引', () => {
    const layout = computeJournalLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }, 500, 2400);
    expect(layout.cells.length).toBeLessThan(40);
    expect(layout.cells.map((cell) => cell.entryIndex)).toEqual([...layout.cells.map((cell) => cell.entryIndex)].sort((a, b) => a - b));
    expect(layout.contentHeight).toBeGreaterThan(874);
    expect(layout.noteY).toBe(874 - 34 - 18);
    expect(computeJournalLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }, 500, 8000).noteY).toBe(layout.noteY);
  });
});
