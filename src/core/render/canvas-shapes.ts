import { Rect } from '../wallet/flap-hit-test';

/** 画师层共用的基础形状绘制 */

/** 圆角矩形路径（不填充不描边，仅构建 path） */
export function buildRoundedRectPath(
  renderingContext: CanvasRenderingContext2D,
  rect: Rect,
  cornerRadius: number,
): void {
  renderingContext.beginPath();
  renderingContext.moveTo(rect.left + cornerRadius, rect.top);
  renderingContext.lineTo(rect.left + rect.width - cornerRadius, rect.top);
  renderingContext.quadraticCurveTo(rect.left + rect.width, rect.top, rect.left + rect.width, rect.top + cornerRadius);
  renderingContext.lineTo(rect.left + rect.width, rect.top + rect.height - cornerRadius);
  renderingContext.quadraticCurveTo(
    rect.left + rect.width,
    rect.top + rect.height,
    rect.left + rect.width - cornerRadius,
    rect.top + rect.height,
  );
  renderingContext.lineTo(rect.left + cornerRadius, rect.top + rect.height);
  renderingContext.quadraticCurveTo(rect.left, rect.top + rect.height, rect.left, rect.top + rect.height - cornerRadius);
  renderingContext.lineTo(rect.left, rect.top + cornerRadius);
  renderingContext.quadraticCurveTo(rect.left, rect.top, rect.left + cornerRadius, rect.top);
  renderingContext.closePath();
}
