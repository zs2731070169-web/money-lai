import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POSTCARD_ID, POSTCARD_CATALOG, chooseNextPostcardId, normalizePostcardId,
} from '../../src/core/letter/postcard-catalog';

describe('真实明信片素材目录', () => {
  it('只登记随包发布的真实信纸位图，不生成程序化图案', () => {
    expect(POSTCARD_CATALOG).toEqual([
      { id: 'postcard-lily-paper', name: '铃兰信纸', assetKey: 'letterPaper', burnSeed: 1709 },
    ]);
    expect(chooseNextPostcardId([], () => 0.5)).toBe(DEFAULT_POSTCARD_ID);
  });

  it('旧版程序化图案编号统一迁移到真实信纸素材', () => {
    expect(normalizePostcardId('postcard-01')).toBe(DEFAULT_POSTCARD_ID);
    expect(normalizePostcardId('postcard-24')).toBe(DEFAULT_POSTCARD_ID);
    expect(normalizePostcardId('unknown')).toBeNull();
  });
});
