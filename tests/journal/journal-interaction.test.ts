import { describe, expect, it } from 'vitest';
import { hitJournalCell } from '../../src/core/render/app-overlay-painter';

describe('手帐单元命中', () => {
  it('点按图案展开固定索引，空白记录也可命中', () => {
    const safe = { top: 62, bottom: 34, left: 0, right: 0 };
    expect(hitJournalCell(402, 874, safe, 3, 0, 30, 155)).toBe(0);
    expect(hitJournalCell(402, 874, safe, 3, 0, 390, 800)).toBeNull();
  });
});

