import { describe, expect, it } from 'vitest';
import {
  BILL_SKIN_TINTS,
  WALLET_SKIN_PALETTES,
  resolveBillColors,
  resolveBillSkinTint,
  resolveWalletLeatherPalette,
} from '../../src/core/render/skin-palettes';
import { DENOMINATION_COLOR_MAP, WALLET_LEATHER_COLORS } from '../../src/core/render/design-tokens';

/**
 * 皮肤色板解析（wire-skin-palettes）：
 * 皮肤切换的外观生效依赖「按 activeSkinId 解析色板」这一纯函数层。
 */

describe('钱包皮肤色板', () => {
  it('classic 与现状逐字节一致（含皮革切边色），保证零视觉回归', () => {
    const classic = resolveWalletLeatherPalette('wallet-classic');
    expect(classic.bodyColorHex).toBe(WALLET_LEATHER_COLORS.bodyColorHex);
    expect(classic.shadowColorHex).toBe(WALLET_LEATHER_COLORS.shadowColorHex);
    expect(classic.deepColorHex).toBe(WALLET_LEATHER_COLORS.deepColorHex);
    expect(classic.stitchingColorHex).toBe(WALLET_LEATHER_COLORS.stitchingColorHex);
    expect(classic.liningColorHex).toBe(WALLET_LEATHER_COLORS.liningColorHex);
    expect(classic.edgeColorHex).toBe('#5C4633');
  });

  it('每款钱包皮肤六色齐全且主体色互不相同', () => {
    const walletSkinIds = ['wallet-classic', 'wallet-caramel', 'wallet-moss', 'wallet-dusk', 'wallet-berry'];
    expect(Object.keys(WALLET_SKIN_PALETTES).sort()).toEqual([...walletSkinIds].sort());
    const bodyColors = walletSkinIds.map((skinId) => {
      const palette = WALLET_SKIN_PALETTES[skinId];
      for (const colorValue of Object.values(palette)) {
        expect(colorValue).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      return palette.bodyColorHex;
    });
    expect(new Set(bodyColors).size).toBe(walletSkinIds.length);
  });

  it('未激活/纸纹皮肤/未知 id 一律回退 classic', () => {
    const classic = resolveWalletLeatherPalette('wallet-classic');
    expect(resolveWalletLeatherPalette(null)).toEqual(classic);
    expect(resolveWalletLeatherPalette('bill-sage')).toEqual(classic);
    expect(resolveWalletLeatherPalette('wallet-unknown')).toEqual(classic);
  });
});

describe('纸纹皮肤染色', () => {
  it('bill-* 皮肤产生染色，wallet-* 与未知 id 不产生', () => {
    expect(resolveBillSkinTint('bill-sage')).toBeDefined();
    expect(resolveBillSkinTint('bill-aurum')).toBeDefined();
    expect(resolveBillSkinTint('wallet-moss')).toBeNull();
    expect(resolveBillSkinTint(null)).toBeNull();
    expect(BILL_SKIN_TINTS['bill-sage'].blendRatio).toBeGreaterThan(0);
    expect(BILL_SKIN_TINTS['bill-sage'].blendRatio).toBeLessThan(1);
  });

  it('无染色时返回面额原色（与令牌逐字节一致）', () => {
    for (const [denominationId, rawColors] of Object.entries(DENOMINATION_COLOR_MAP)) {
      expect(resolveBillColors(denominationId, null)).toEqual(rawColors);
      expect(resolveBillColors(denominationId, 'wallet-berry')).toEqual(rawColors);
    }
  });

  it('染色后面额底色与印墨均改变，且各面额间仍可分辨（保留专属色相守卫语义）', () => {
    const sageColorByDenomination = Object.keys(DENOMINATION_COLOR_MAP).map(
      (denominationId) => resolveBillColors(denominationId, 'bill-sage').baseColorHex,
    );
    for (const [denominationId, rawColors] of Object.entries(DENOMINATION_COLOR_MAP)) {
      const tinted = resolveBillColors(denominationId, 'bill-sage');
      expect(tinted.baseColorHex).not.toBe(rawColors.baseColorHex);
      expect(tinted.inkColorHex).not.toBe(rawColors.inkColorHex);
    }
    expect(new Set(sageColorByDenomination).size).toBeGreaterThan(1);
  });
});
