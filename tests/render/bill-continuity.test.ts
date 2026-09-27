import { describe, expect, it } from 'vitest';
import {
  billDrawTravelDistance,
  billRectAtDrawRatio,
} from '../../src/core/render/bill-geometry';
import { paintActiveBill } from '../../src/core/render/bill-painter';
import { computeSceneLayout } from '../../src/core/render/scene-layout';

const layout = computeSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });

describe('堆顶纸币到抽出纸币的连续性', () => {
  it('比例 0 从堆顶原位开始，比例 1 时底边恰好离开钱包口', () => {
    const atRest = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0);
    const extracted = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 1);
    expect(atRest.top).toBe(layout.walletFoldLineY - 35);
    expect(atRest.width).toBe(layout.walletRect.width - 16);
    expect(layout.activeBillHeight).toBe(
      billDrawTravelDistance(layout.walletRect, layout.walletFoldLineY),
    );
    expect(extracted.top).toBe(atRest.top - layout.activeBillHeight);
    expect(extracted.top + extracted.height).toBe(layout.walletFoldLineY);
  });

  it('刚抓住但尚未移动时仍绘制原位纸币，并以折线裁掉钱包内部分', () => {
    const clippingRects: number[][] = [];
    let fills = 0;
    const context = new Proxy({}, {
      get(_target, property) {
        if (property === 'rect') {
          return (...args: number[]) => clippingRects.push(args);
        }
        if (property === 'fill') return () => { fills += 1; };
        return () => {};
      },
      set() { return true; },
    }) as unknown as CanvasRenderingContext2D;
    const billRect = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0);
    paintActiveBill(context, {
      billRect,
      foldLineY: layout.walletFoldLineY,
      dragVelocityPixelsPerSecond: 0,
      denominationId: 'denomination-1',
    });
    expect(fills).toBeGreaterThan(0);
    expect(clippingRects).toHaveLength(1);
    expect(clippingRects[0][1] + clippingRects[0][3]).toBe(layout.walletFoldLineY);
  });
});
