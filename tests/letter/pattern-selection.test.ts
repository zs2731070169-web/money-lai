import { describe, expect, it } from 'vitest';
import { POSTCARD_PATTERNS, chooseNextPatternId } from '../../src/core/letter/patterns';

describe('明信片图案分配', () => {
  it('固定内置 24 个图案且首次使用随机源', () => {
    expect(POSTCARD_PATTERNS).toHaveLength(24);
    expect(chooseNextPatternId([], () => 0.5)).toBe(POSTCARD_PATTERNS[12].id);
  });

  it('优先未收集图案，全部收集后循环', () => {
    const collected = POSTCARD_PATTERNS.slice(0, 23).map((pattern) => pattern.id);
    expect(chooseNextPatternId(collected, () => 0)).toBe(POSTCARD_PATTERNS[23].id);
    expect(chooseNextPatternId(POSTCARD_PATTERNS.map((pattern) => pattern.id), () => 0.999)).toBe(POSTCARD_PATTERNS[23].id);
  });
});

