import { Rect } from '../wallet/flap-hit-test';

export const BILL_STACK_LAYER_COUNT = 6;
export const BILL_STACK_LAYER_STRIDE_PIXELS = 5;
const BACK_LAYER_PEEK_PIXELS = 60;

export function billStackBillWidth(walletRect: Rect): number {
  return walletRect.width - 16;
}

export function billStackBillHeight(walletRect: Rect): number {
  return Math.round(billStackBillWidth(walletRect) * 2.0);
}

/** 最后绘制的堆顶张，位于其余五张之前。 */
export function billStackTopLayerPeekTopY(foldLineY: number): number {
  return foldLineY - BACK_LAYER_PEEK_PIXELS +
    (BILL_STACK_LAYER_COUNT - 1) * BILL_STACK_LAYER_STRIDE_PIXELS;
}

export function billDrawTravelDistance(walletRect: Rect, foldLineY: number): number {
  return billStackBillHeight(walletRect) + billStackTopLayerPeekTopY(foldLineY) - foldLineY;
}

export function billRectAtDrawRatio(walletRect: Rect, foldLineY: number, ratio: number): Rect {
  const width = billStackBillWidth(walletRect);
  return {
    left: walletRect.left + (walletRect.width - width) / 2,
    top: billStackTopLayerPeekTopY(foldLineY) -
      Math.max(0, Math.min(1, ratio)) * billDrawTravelDistance(walletRect, foldLineY),
    width,
    height: billStackBillHeight(walletRect),
  };
}
