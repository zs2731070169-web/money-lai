/**
 * 颜色工具：hex 解析、线性混合与透明度（画师层共用的唯一实现）。
 */

/** 解析 #RRGGBB 为 [r, g, b] */
export function parseHexColorToRgb(hexColor: string): [number, number, number] {
  const normalized = hexColor.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

/** 两个 hex 色的线性混合，输出 rgb() 字符串 */
export function blendCssColor(fromHex: string, toHex: string, ratio: number): string {
  const [fromRed, fromGreen, fromBlue] = parseHexColorToRgb(fromHex);
  const [toRed, toGreen, toBlue] = parseHexColorToRgb(toHex);
  return `rgb(${Math.round(fromRed + (toRed - fromRed) * ratio)}, ${Math.round(
    fromGreen + (toGreen - fromGreen) * ratio,
  )}, ${Math.round(fromBlue + (toBlue - fromBlue) * ratio)})`;
}

/** hex 色 + 透明度 → rgba() 字符串 */
export function cssColorWithAlpha(hexColor: string, alpha: number): string {
  const [red, green, blue] = parseHexColorToRgb(hexColor);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
