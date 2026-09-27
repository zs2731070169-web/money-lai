import { CASH_DENOMINATIONS } from '../cash/denomination';

/**
 * 设计令牌（design.md D4 视觉快照的唯一代码落点）：
 * 全资产配色/字体从这里取值——同色板、同光源（左上）、同线宽的反廉价纪律由集中定义保证。
 */

export interface SceneBackgroundPalette {
  name: string;
  /** 顶部色（光源方向：左上） */
  topColorHex: string;
  bottomColorHex: string;
}

/** 背景色板三组：分钟级缓慢漂移（game-visuals 规格「色彩与光源体系」） */
export const SCENE_BACKGROUND_PALETTES: SceneBackgroundPalette[] = [
  { name: '黄昏', topColorHex: '#F7EFE4', bottomColorHex: '#F1DEC9' },
  { name: '清晨', topColorHex: '#F3F1E8', bottomColorHex: '#E7EBDF' },
  { name: '暮霭', topColorHex: '#F4E9E3', bottomColorHex: '#E9D9D2' },
];

/** 钱包皮革配色（光源左上：亮面在上、暗面在右下） */
export const WALLET_LEATHER_COLORS = {
  bodyColorHex: '#B08968',
  shadowColorHex: '#97755A',
  deepColorHex: '#8C6647',
  stitchingColorHex: '#F2E5D0',
  liningColorHex: '#6B7F74',
} as const;

/** 纸币纸基色（暖纸白） */
export const BILL_PAPER_BASE_COLOR_HEX = '#F4EFE2';

/** 每档面额专属色相（底色 + 印墨色；统一版画线宽见 BILL_ENGRAVING_LINE_WIDTH） */
export const DENOMINATION_COLOR_MAP: Record<string, { baseColorHex: string; inkColorHex: string }> = {
  'denomination-1': { baseColorHex: '#A9C4AE', inkColorHex: '#6E8F78' },
  'denomination-5': { baseColorHex: '#9FBFB4', inkColorHex: '#66897C' },
  'denomination-10': { baseColorHex: '#A8BCC8', inkColorHex: '#6F8899' },
  'denomination-50': { baseColorHex: '#E5C79C', inkColorHex: '#A98A5C' },
  'denomination-100': { baseColorHex: '#E8C37E', inkColorHex: '#AB8348' },
};

/** 版画线宽（逻辑像素）：全档统一 */
export const BILL_ENGRAVING_LINE_WIDTH = 2;

/** 文字墨青（金额常态色，对比度 ≥4.5:1） */
export const INK_TEXT_COLOR_HEX = '#3F4A45';

/** 里程碑瞬时闪色（蜜金：仅装饰，不承担信息） */
export const MILESTONE_FLASH_COLOR_HEX = '#C89B4B';

/** 金额数字字体栈：圆体优先（iOS ui-rounded），中文回退系统栈 */
export const AMOUNT_FONT_STACK = "ui-rounded, 'SF Pro Rounded', 'Yuanti SC', 'PingFang SC', sans-serif";

/** 夜间基调亮度系数（sleep-mode 规格「夜间视觉基调」）：同色板整体压暗、无色相切换。
 *  0.55 兼顾「明显变暗」与「金额大数字对比度 ≥3:1（WCAG，按最浅背景色板验算）」。 */
export const NIGHT_BASE_BRIGHTNESS_FACTOR = 0.55;

/** 夜间压暗叠层色（暖黑）：alpha 合成只降明度、保持暖色相 */
export const NIGHT_DIM_OVERLAY_COLOR_HEX = '#181109';

/** 场景总亮度合成（sleep-mode 规格）：日间恒 1；夜间 = 夜间基准 × 熄灭弧线系数（1 → 约 0.02）。
 *  与减弱动态无耦合——渐进熄灭是状态收敛型过渡，减弱动态下同样生效。 */
export function resolveSceneBrightness(
  isBedtimeSession: boolean,
  sleepArcBrightness: number,
): number {
  return isBedtimeSession ? NIGHT_BASE_BRIGHTNESS_FACTOR * sleepArcBrightness : 1;
}

/** 亮度 → 压暗叠层不透明度：亮度 1 → 0（不叠加）；越暗不透明度越高，钳制到 [0,1] */
export function brightnessToDimOverlayAlpha(sceneBrightness: number): number {
  return Math.min(1, Math.max(0, 1 - sceneBrightness));
}

/** 获取面额配色（未知 id 回退纸基色） */
export function getDenominationColors(denominationId: string): { baseColorHex: string; inkColorHex: string } {
  return DENOMINATION_COLOR_MAP[denominationId] ?? {
    baseColorHex: BILL_PAPER_BASE_COLOR_HEX,
    inkColorHex: INK_TEXT_COLOR_HEX,
  };
}

/** 设计令牌完整性：每档面额都必须有专属色相 */
export function assertDesignTokenCoverage(): void {
  for (const denomination of CASH_DENOMINATIONS) {
    if (!DENOMINATION_COLOR_MAP[denomination.id]) {
      throw new Error(`设计令牌缺失：面额 ${denomination.id} 无专属色相`);
    }
  }
}
