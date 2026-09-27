import { Rect } from '../wallet/flap-hit-test';
import { AMOUNT_FONT_STACK } from './design-tokens';
import { resolveBillColors } from './skin-palettes';
import { getCashDenominationById } from '../cash/denomination';
import { buildRoundedRectPath } from './canvas-shapes';

/**
 * 纸币画师（cash-drawing/game-visuals 规格）：
 * 虚构 lai 币——统一版画线宽、面额专属色相、纸面随拖拽速度弯曲形变、follow-through 飘落。
 */

/** 跟手抽出中的纸币 */
export interface ActiveBillPaintOptions {
  /** 与钱包内堆顶张共用的完整票面矩形，已按抽出比例上移 */
  billRect: Rect;
  /** 钱包口折线：折线以下的票面被钱包正面遮挡 */
  foldLineY: number;
  /** 拖拽速度（逻辑像素/秒）：映射纸面弯曲 */
  dragVelocityPixelsPerSecond: number;
  denominationId: string;
  /** 纸纹皮肤 id（wire-skin-palettes）：染色取色，缺省为面额原色 */
  billSkinId?: string;
}

export function paintActiveBill(
  renderingContext: CanvasRenderingContext2D,
  options: ActiveBillPaintOptions,
): void {
  const { billRect, foldLineY, dragVelocityPixelsPerSecond, denominationId, billSkinId } =
    options;
  if (billRect.top >= foldLineY) return;
  // 纸面弯曲：速度映射的弓形幅度（向上拖 → 上边中点向上弓）
  const bendPixels = Math.max(-12, Math.min(12, dragVelocityPixelsPerSecond * -0.012));

  renderingContext.save();
  renderingContext.beginPath();
  renderingContext.rect(billRect.left - 16, billRect.top - 16,
    billRect.width + 32, foldLineY - billRect.top + 16);
  renderingContext.clip();
  paintLaiBanknote(renderingContext, billRect, denominationId, bendPixels, billSkinId);

  renderingContext.restore();
}

/** follow-through 飘落中的纸币（松手后上飘淡出） */
export interface FlyingBillView {
  x: number;
  y: number;
  rotationDegrees: number;
  alpha: number;
  width: number;
  height: number;
  denominationId: string;
  /** 纸纹皮肤 id：飘落票面与抽出票面同色（皮肤一致性） */
  billSkinId?: string;
}

export function paintFlyingBill(
  renderingContext: CanvasRenderingContext2D,
  flyingBill: FlyingBillView,
): void {
  renderingContext.save();
  renderingContext.globalAlpha = flyingBill.alpha;
  renderingContext.translate(flyingBill.x, flyingBill.y);
  renderingContext.rotate((flyingBill.rotationDegrees * Math.PI) / 180);
  const flyingBillRect: Rect = {
    left: -flyingBill.width / 2,
    top: -flyingBill.height / 2,
    width: flyingBill.width,
    height: flyingBill.height,
  };
  paintLaiBanknote(renderingContext, flyingBillRect, flyingBill.denominationId, 0, flyingBill.billSkinId);
  renderingContext.restore();
}

/** 堆叠、拖动和飘走的同一张完整票面。 */
export function paintLaiBanknote(
  renderingContext: CanvasRenderingContext2D,
  billRect: Rect,
  denominationId: string,
  bendPixels = 0,
  billSkinId?: string | null,
): void {
  const colors = resolveBillColors(denominationId, billSkinId);
  renderingContext.save();
  if (bendPixels === 0) {
    // 票面圆角 6pt（实测反馈：2pt 在高倍屏上圆弧过小呈台阶感，不够圆滑）
    buildRoundedRectPath(renderingContext, billRect, 6);
  } else {
    renderingContext.beginPath();
    renderingContext.moveTo(billRect.left, billRect.top);
    renderingContext.quadraticCurveTo(
      billRect.left + billRect.width / 2, billRect.top + bendPixels,
      billRect.left + billRect.width, billRect.top,
    );
    renderingContext.lineTo(billRect.left + billRect.width, billRect.top + billRect.height);
    renderingContext.lineTo(billRect.left, billRect.top + billRect.height);
    renderingContext.closePath();
  }
  renderingContext.fillStyle = colors.baseColorHex;
  renderingContext.fill();
  paintLaiBanknoteOrnaments(renderingContext, billRect, denominationId, billSkinId);
  renderingContext.restore();
}
/**
 * lai 币统一票面纹样（v3.1，与钱包内堆叠/拖动/飘落共用同一语言）：
 * 顶部暗带 12%、双细线雕版内框、30% 高度装饰带（点线+左右小椭圆）、中央折痕。
 * 无面值角标（用户定稿）。底色由调用方填充。
 */
export function paintLaiBanknoteOrnaments(
  renderingContext: CanvasRenderingContext2D,
  faceRect: Rect,
  denominationId: string,
  billSkinId?: string | null,
): void {
  const denominationColors = resolveBillColors(denominationId, billSkinId);
  const { left: billLeft, top: billTop, width: billWidth, height: billHeight } = faceRect;
  if (billWidth < 12 || billHeight < 12) return;

  renderingContext.save();
  renderingContext.strokeStyle = denominationColors.inkColorHex;

  // 雕版内框：外实线 + 内细线
  renderingContext.globalAlpha = 0.65;
  renderingContext.lineWidth = 1.5;
  buildRoundedRectPath(renderingContext, {
    left: billLeft + 5, top: billTop + 5, width: billWidth - 10, height: billHeight - 10,
  }, 2);
  renderingContext.stroke();
  renderingContext.globalAlpha = 0.4;
  buildRoundedRectPath(renderingContext, {
    left: billLeft + 9, top: billTop + 9, width: billWidth - 18, height: billHeight - 18,
  }, 2);
  renderingContext.stroke();

  // 30% 高度装饰带：点线 + 左右小椭圆
  const bandY = billTop + billHeight * 0.3;
  renderingContext.globalAlpha = 0.55;
  renderingContext.lineWidth = 1.5;
  renderingContext.setLineDash([3, 3]);
  renderingContext.beginPath();
  renderingContext.moveTo(billLeft + billWidth * 0.24, bandY);
  renderingContext.lineTo(billLeft + billWidth * 0.76, bandY);
  renderingContext.stroke();
  renderingContext.setLineDash([]);
  renderingContext.beginPath();
  renderingContext.ellipse(billLeft + billWidth * 0.14, bandY, billWidth * 0.045, Math.min(billHeight * 0.14, 14), 0, 0, Math.PI * 2);
  renderingContext.stroke();
  renderingContext.beginPath();
  renderingContext.ellipse(billLeft + billWidth * 0.86, bandY, billWidth * 0.045, Math.min(billHeight * 0.14, 14), 0, 0, Math.PI * 2);
  renderingContext.stroke();

  // 居中大面值（v3.2 恢复：无四角角标，但中央面值保留——纸币经典构图）
  const faceValueText = String(getCashDenominationById(denominationId)?.faceValue ?? '?');
  const valueFontSize = Math.min(billWidth * 0.3, billHeight * 0.34);
  renderingContext.globalAlpha = 0.92;
  renderingContext.fillStyle = denominationColors.inkColorHex;
  renderingContext.font = `700 ${Math.round(valueFontSize)}px ${AMOUNT_FONT_STACK}`;
  renderingContext.textAlign = 'center';
  renderingContext.textBaseline = 'middle';
  renderingContext.fillText(faceValueText, billLeft + billWidth / 2, billTop + billHeight * 0.62);

  // 中央对折痕（亮+暗双线贯穿）
  const creaseX = billLeft + billWidth / 2;
  renderingContext.globalAlpha = 0.22;
  renderingContext.fillStyle = '#FFFFFF';
  renderingContext.fillRect(creaseX - 1, billTop + 3, 1, billHeight - 6);
  renderingContext.globalAlpha = 0.3;
  renderingContext.fillStyle = denominationColors.inkColorHex;
  renderingContext.fillRect(creaseX, billTop + 3, 1, billHeight - 6);

  renderingContext.restore();
}
