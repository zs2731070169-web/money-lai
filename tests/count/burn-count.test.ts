import { describe, expect, it } from 'vitest';
import { parseBurnCountResponse, shouldDisplayBurnCount } from '../../src/core/count/burn-count';

describe('匿名燃烧计数', () => {
  it('只在第 1、3、5 及后续奇数次显示', () => {
    expect([1, 2, 3, 4, 5].map(shouldDisplayBurnCount)).toEqual([true, false, true, false, true]);
  });

  it('只接受至少为 1 的安全整数', () => {
    expect(parseBurnCountResponse({ count: 8 })).toBe(8);
    for (const invalid of [null, {}, { count: 0 }, { count: 1.5 }, { count: '8' }]) {
      expect(parseBurnCountResponse(invalid)).toBeNull();
    }
  });
});

