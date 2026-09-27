/**
 * 心事钞与指尖纸沓画师（worry-release 规格，任务 3.1/3.2）。
 * 心事钞票面 = 暖纸白底 + 淡墨字迹（可见度随抽起渐显：堆顶淡字 → 抽起清晰）；
 * 指尖纸沓 = 放飞凝沓时跟随指尖的一小叠纸钞（微垂坠偏移由编排层平滑后传入）。
 */

import { Rect } from '../wallet/flap-hit-test';
import { BILL_PAPER_BASE_COLOR_HEX, INK_TEXT_COLOR_HEX } from './design-tokens';
import { buildRoundedRectPath } from './canvas-shapes';

/** 心事钞字迹最低可见度（堆顶静置淡字）与最高可见度（抽起清晰） */
export const WORRY_TEXT_MIN_VISIBILITY = 0.28;
export const WORRY_TEXT_MAX_VISIBILITY = 1;

/**
 * 心事钞票面：暖纸白圆角底 + 墨色文本（可见度插值控制淡字↔清晰）。
 * 文本按票面宽截断（超出以省略号收尾），字号随票面宽缩放。
 */
export function paintWorryBillFace(
  renderingContext: CanvasRenderingContext2D,
  billRect: Rect,
  text: string,
  textVisibilityRatio: number,
): void {
  const clampedVisibility = Math.min(
    WORRY_TEXT_MAX_VISIBILITY,
    Math.max(WORRY_TEXT_MIN_VISIBILITY, textVisibilityRatio),
  );
  renderingContext.save();
  // 票底：暖纸白 + 细墨描边（区别于面额钞的有彩色票面）
  buildRoundedRectPath(renderingContext, billRect, 6);
  renderingContext.fillStyle = BILL_PAPER_BASE_COLOR_HEX;
  renderingContext.fill();
  renderingContext.strokeStyle = 'rgba(63, 74, 69, 0.35)';
  renderingContext.lineWidth = 1.5;
  renderingContext.stroke();
  // 字迹：可见度驱动（堆顶 0.28 淡字 → 抽起 1.0 清晰）
  renderingContext.globalAlpha = clampedVisibility;
  renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
  const fontSize = Math.max(9, Math.round(billRect.width * 0.11));
  renderingContext.font = `500 ${fontSize}px 'PingFang SC', sans-serif`;
  renderingContext.textAlign = 'center';
  renderingContext.textBaseline = 'middle';
  const maxTextWidth = billRect.width - billRect.width * 0.16;
  renderingContext.fillText(
    truncateTextToWidth(renderingContext, text, maxTextWidth),
    billRect.left + billRect.width / 2,
    billRect.top + billRect.height / 2,
  );
  renderingContext.restore();
}

/** 指尖纸沓：放飞凝沓时的一小叠纸钞（错位微旋层叠，顶层纸白；swayPixels 为垂坠偏移） */
export function paintGraspedBillStack(
  renderingContext: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  billWidth: number,
  billHeight: number,
  swayPixels: number,
): void {
  renderingContext.save();
  const layerCount = 5;
  for (let layerIndex = layerCount - 1; layerIndex >= 0; layerIndex -= 1) {
    const layerOffsetY = layerIndex * 3 + swayPixels;
    const layerRotation = ((layerIndex % 2 === 0 ? 1 : -1) * (2 + layerIndex * 0.8) * Math.PI) / 180;
    renderingContext.save();
    renderingContext.translate(centerX, centerY + layerOffsetY);
    renderingContext.rotate(layerRotation);
    const layerRect: Rect = {
      left: -billWidth / 2,
      top: -billHeight / 2,
      width: billWidth,
      height: billHeight,
    };
    buildRoundedRectPath(renderingContext, layerRect, 5);
    renderingContext.fillStyle =
      layerIndex === 0 ? BILL_PAPER_BASE_COLOR_HEX : 'rgba(169, 196, 174, 0.85)';
    renderingContext.fill();
    renderingContext.strokeStyle = 'rgba(63, 74, 69, 0.2)';
    renderingContext.lineWidth = 1;
    renderingContext.stroke();
    renderingContext.restore();
  }
  renderingContext.restore();
}

/** 按像素宽截断（中文逐字测量最稳，超出以省略号收尾） */
function truncateTextToWidth(
  renderingContext: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (renderingContext.measureText(text).width <= maxWidth) {
    return text;
  }
  let truncated = text;
  while (truncated.length > 1 && renderingContext.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}
