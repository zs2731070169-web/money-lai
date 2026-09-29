import { describe, expect, it } from 'vitest';
import { FONT_PACKAGES, fontPackageById, fontStackForPackage } from '../../src/core/render/letter-font';

describe('字体套餐目录', () => {
  it('提供三组本地混排套餐且族名稳定', () => {
    expect(FONT_PACKAGES.map((item) => item.id)).toEqual(['warm-handwriting', 'classical-elegant', 'romantic-literary']);
    for (const item of FONT_PACKAGES) {
      expect(item.assets.length).toBeGreaterThan(0);
      expect(item.fontStack).toContain('Letter ');
      expect(fontPackageById(item.id)).toBe(item);
    }
    expect(fontStackForPackage('romantic-literary')).toContain('Letter Cormorant Garamond');
    expect(fontStackForPackage('romantic-literary')).toContain('Letter LXGW WenKai');
  });

  it('未知套餐安全回退到温柔手写', () => {
    expect(fontPackageById('missing').id).toBe('warm-handwriting');
  });
});
