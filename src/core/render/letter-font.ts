/**
 * 本地字体套餐目录。
 * core 只消费稳定的族名栈；字体文件的解码和注册由 adapters/font-loader.ts 完成。
 */
export type FontPackageId = 'warm-handwriting' | 'classical-elegant' | 'romantic-literary';

export interface LetterFontAsset {
  family: string;
  fileName: string;
  format: 'truetype' | 'opentype';
  weight?: string;
}

export interface LetterFontPackage {
  id: FontPackageId;
  copyKey: FontPackageId;
  fontStack: string;
  assets: readonly LetterFontAsset[];
  previewEnglish: string;
}

export const DEFAULT_FONT_PACKAGE_ID: FontPackageId = 'warm-handwriting';

export const FONT_PACKAGES: readonly LetterFontPackage[] = [
  {
    id: 'warm-handwriting',
    copyKey: 'warm-handwriting',
    fontStack: "'Letter LXGW WenKai','Letter Yozai',cursive",
    assets: [
      { family: 'Letter LXGW WenKai', fileName: 'LXGWWenKaiLite-Regular.ttf', format: 'truetype' },
      { family: 'Letter Yozai', fileName: 'Yozai-Regular.ttf', format: 'truetype' },
    ],
    previewEnglish: 'with all my heart',
  },
  {
    id: 'classical-elegant',
    copyKey: 'classical-elegant',
    fontStack: "'Letter Noto Serif SC',serif",
    assets: [
      { family: 'Letter Noto Serif SC', fileName: 'NotoSerifSC-Regular.ttf', format: 'truetype' },
    ],
    previewEnglish: 'a quiet letter, a long echo',
  },
  {
    id: 'romantic-literary',
    copyKey: 'romantic-literary',
    fontStack: "'Letter Cormorant Garamond','Letter LXGW WenKai',serif",
    assets: [
      { family: 'Letter Cormorant Garamond', fileName: 'CormorantGaramond-Regular.ttf', format: 'truetype' },
      { family: 'Letter LXGW WenKai', fileName: 'LXGWWenKaiLite-Regular.ttf', format: 'truetype' },
    ],
    previewEnglish: 'softly, and always',
  },
] as const;

export const LETTER_HANDWRITING_FONT_FAMILY = 'Letter LXGW WenKai';
export const HANDWRITING_FONT_STACK = FONT_PACKAGES[0].fontStack;

export function fontPackageById(id: string | null | undefined): LetterFontPackage {
  return FONT_PACKAGES.find((item) => item.id === id) ?? FONT_PACKAGES[0];
}

export function isFontPackageId(value: unknown): value is FontPackageId {
  return typeof value === 'string' && FONT_PACKAGES.some((item) => item.id === value);
}

export function fontStackForPackage(id: string | null | undefined): string {
  return fontPackageById(id).fontStack;
}
