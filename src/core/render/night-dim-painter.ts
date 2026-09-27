import { brightnessToDimOverlayAlpha, NIGHT_DIM_OVERLAY_COLOR_HEX } from './design-tokens';

/**
 * 夜间压暗叠层（sleep-mode 规格「夜间视觉基调 / 渐进熄灭」的渲染落点）：
 * 全画面以暖黑统一乘算亮度——保色相只降明度，各画师（painter）输出零改动；
 * 日间（亮度 ≥1）不产生任何绘制，日间渲染输出与既有完全一致。
 */
export function paintNightDimOverlay(
  renderingContext: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  sceneBrightness: number,
): void {
  if (sceneBrightness >= 1) {
    return;
  }
  const previousGlobalAlpha = renderingContext.globalAlpha;
  const previousFillStyle = renderingContext.fillStyle;
  renderingContext.globalAlpha = brightnessToDimOverlayAlpha(sceneBrightness);
  renderingContext.fillStyle = NIGHT_DIM_OVERLAY_COLOR_HEX;
  renderingContext.fillRect(0, 0, viewportWidth, viewportHeight);
  // 恢复上游画师残留状态（与里程表绘制色自持性同一纪律）
  renderingContext.globalAlpha = previousGlobalAlpha;
  renderingContext.fillStyle = previousFillStyle;
}
