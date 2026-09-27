import { WALLET_LEATHER_COLORS, getDenominationColors } from './design-tokens';
import { blendCssColor } from '../utility/color-utilities';

/**
 * 皮肤色板与解析（wire-skin-palettes，meta-progression「皮肤切换 → 外观即时生效」）：
 * 按 activeSkinId 把皮肤落成画师可直接消费的颜色——钱包换整组皮革色，
 * 纸纹做保相位的线性染色（每档面额专属色相的令牌守卫语义保持）。
 * 色板属 render 层内容数据；meta/skins.ts 仍只管解锁与选择，两层以皮肤 id 解耦。
 */

/** 钱包皮革六色组（比设计令牌多一个切边色：侧对视线的皮革厚度呈现） */
export interface WalletLeatherPalette {
  /** 主体色 */
  bodyColorHex: string;
  /** 投影色（柔和投影用） */
  shadowColorHex: string;
  /** 深部色（钮扣/折线接缝/背面描边） */
  deepColorHex: string;
  /** 缝线色 */
  stitchingColorHex: string;
  /** 内衬色（翻盖背面/钱包内里） */
  liningColorHex: string;
  /** 皮革切边色（厚度兜底细条） */
  edgeColorHex: string;
}

/** 纸纹皮肤：向皮肤色线性混合的染色配置 */
export interface BillSkinTint {
  /** 纸面染色目标色 */
  tintHex: string;
  /** 印墨染色目标色 */
  inkTintHex: string;
  /** 底色混合比例（印墨按其 0.75 倍混合，保印读可读性） */
  blendRatio: number;
}

/** 钱包皮肤色板（classic 与设计令牌逐字节一致 + 现行切边色，零视觉回归） */
export const WALLET_SKIN_PALETTES: Record<string, WalletLeatherPalette> = {
  'wallet-classic': {
    ...WALLET_LEATHER_COLORS,
    edgeColorHex: '#5C4633',
  },
  // 焦糖棕：更暖更亮的糖化皮革，内衬走灰绿原族
  'wallet-caramel': {
    bodyColorHex: '#C4906A',
    shadowColorHex: '#AB7952',
    deepColorHex: '#9A6A45',
    stitchingColorHex: '#F6E9D4',
    liningColorHex: '#7B8A6F',
    edgeColorHex: '#6B4A33',
  },
  // 苔绿：苔色皮革配草黄内衬（对比换掉原绿内衬）
  'wallet-moss': {
    bodyColorHex: '#8A9472',
    shadowColorHex: '#76815F',
    deepColorHex: '#66724F',
    stitchingColorHex: '#EFEAD6',
    liningColorHex: '#C7B693',
    edgeColorHex: '#4E5A40',
  },
  // 暮蓝：暮色灰蓝皮革配暖麻内衬
  'wallet-dusk': {
    bodyColorHex: '#77839B',
    shadowColorHex: '#64708A',
    deepColorHex: '#57637D',
    stitchingColorHex: '#E9E5DA',
    liningColorHex: '#C0B29A',
    edgeColorHex: '#3F4A61',
  },
  // 莓粉：浆果灰粉皮革，内衬回灰绿
  'wallet-berry': {
    bodyColorHex: '#C0909A',
    shadowColorHex: '#A97B85',
    deepColorHex: '#9A6C76',
    stitchingColorHex: '#F5E8E4',
    liningColorHex: '#8FA39B',
    edgeColorHex: '#6E4A53',
  },
};

/** 纸纹皮肤染色（对每档面额的原底色/印墨做线性混合） */
export const BILL_SKIN_TINTS: Record<string, BillSkinTint> = {
  // 藕荷纸纹：id 沿用 bill-sage（历史名），色相已由浅豆绿换为藕荷紫（retheme-sage-skin-lilac）
  'bill-sage': { tintHex: '#BCA7C9', inkTintHex: '#82688F', blendRatio: 0.45 },
  'bill-amber': { tintHex: '#E0B472', inkTintHex: '#A57F42', blendRatio: 0.45 },
  'bill-porcelain': { tintHex: '#A3C2CC', inkTintHex: '#6A8794', blendRatio: 0.45 },
  'bill-aurum': { tintHex: '#E3C275', inkTintHex: '#B08D3E', blendRatio: 0.55 },
};

/** 钱包皮革色板解析：wallet-* 皮肤查表，其余（未激活/纸纹/未知）回退 classic */
export function resolveWalletLeatherPalette(activeSkinId: string | null | undefined): WalletLeatherPalette {
  if (activeSkinId && activeSkinId.startsWith('wallet-')) {
    return WALLET_SKIN_PALETTES[activeSkinId] ?? WALLET_SKIN_PALETTES['wallet-classic'];
  }
  return WALLET_SKIN_PALETTES['wallet-classic'];
}

/** 纸纹染色解析：bill-* 皮肤查表，其余返回 null（面额原色） */
export function resolveBillSkinTint(activeSkinId: string | null | undefined): BillSkinTint | null {
  if (activeSkinId && activeSkinId.startsWith('bill-')) {
    return BILL_SKIN_TINTS[activeSkinId] ?? null;
  }
  return null;
}

/** 面额取色（皮肤感知）：无染色返回令牌原值；有染色做保相位的线性混合 */
export function resolveBillColors(
  denominationId: string,
  activeSkinId: string | null | undefined,
): { baseColorHex: string; inkColorHex: string } {
  const rawColors = getDenominationColors(denominationId);
  const billSkinTint = resolveBillSkinTint(activeSkinId);
  if (!billSkinTint) return rawColors;
  return {
    baseColorHex: blendCssColor(rawColors.baseColorHex, billSkinTint.tintHex, billSkinTint.blendRatio),
    inkColorHex: blendCssColor(rawColors.inkColorHex, billSkinTint.inkTintHex, billSkinTint.blendRatio * 0.75),
  };
}
