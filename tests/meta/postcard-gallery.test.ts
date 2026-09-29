import { describe, expect, it } from 'vitest';
import { POSTCARD_PATTERNS } from '../../src/core/letter/patterns';
import { createEmptyLetterBurningState, settleCompletedPostcard } from '../../src/core/journal/journal-state';

describe('独立明信片图鉴', () => {
  it('固定 24 格，完成燃烧后只收集对应图案', () => {
    const state = settleCompletedPostcard(createEmptyLetterBurningState(), { id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: POSTCARD_PATTERNS[7].id, text: '不进入图鉴' });
    expect(POSTCARD_PATTERNS).toHaveLength(24);
    expect(state.collectedPatternIds).toEqual([POSTCARD_PATTERNS[7].id]);
  });
});
