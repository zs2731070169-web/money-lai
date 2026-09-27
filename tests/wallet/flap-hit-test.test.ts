import { describe, expect, it } from 'vitest';
import {
  WALLET_FLAP_FULL_OPEN_ANGLE_DEGREES,
  WALLET_FLAP_HIT_AREA_MARGIN,
  WALLET_FOLD_HEIGHT_RATIO,
  isPointInsideFlapHitArea,
  isPointInsideOpenFlapHitArea,
  walletFlapRotationDegrees,
} from '../../src/core/wallet/flap-hit-test';

/**
 * 翻盖命中区域与进度→角度映射单测（任务 2.3 验证入口，对应 wallet-interaction 规格）。
 */

/** 测试基准钱包矩形：竖屏钱包置于画面中下部 */
const WALLET_RECT = { left: 120, top: 500, width: 140, height: 260 };

describe('翻盖命中区域', () => {
  it('钱包上半部（翻盖区）内的点命中', () => {
    expect(isPointInsideFlapHitArea({ x: 190, y: 540 }, WALLET_RECT)).toBe(true);
  });

  it('钱包下半部（非翻盖区）不命中翻盖', () => {
    expect(isPointInsideFlapHitArea({ x: 190, y: 700 }, WALLET_RECT)).toBe(false);
  });

  it('热区底沿跟随折线（单一事实源：折线下移后触达区同步，无死区）', () => {
    const foldY = WALLET_RECT.top + WALLET_RECT.height * WALLET_FOLD_HEIGHT_RATIO;
    expect(isPointInsideFlapHitArea({ x: 190, y: foldY }, WALLET_RECT)).toBe(true);
    expect(isPointInsideOpenFlapHitArea({ x: 190, y: foldY }, WALLET_RECT, 150)).toBe(true);
  });

  it('热区向外扩宽容余量：上沿外 12px 内仍命中（no-precision-required）', () => {
    expect(
      isPointInsideFlapHitArea({ x: 190, y: WALLET_RECT.top - WALLET_FLAP_HIT_AREA_MARGIN + 1 }, WALLET_RECT),
    ).toBe(true);
    expect(
      isPointInsideFlapHitArea({ x: 190, y: WALLET_RECT.top - WALLET_FLAP_HIT_AREA_MARGIN - 1 }, WALLET_RECT),
    ).toBe(false);
  });

  it('远离钱包的点不命中', () => {
    expect(isPointInsideFlapHitArea({ x: 20, y: 100 }, WALLET_RECT)).toBe(false);
  });
});

describe('进度→翻盖角度映射', () => {
  it('边界值：0→0°、1→全开角', () => {
    expect(walletFlapRotationDegrees(0)).toBe(0);
    expect(walletFlapRotationDegrees(1)).toBe(WALLET_FLAP_FULL_OPEN_ANGLE_DEGREES);
  });

  it('线性：0.5→半角', () => {
    expect(walletFlapRotationDegrees(0.5)).toBeCloseTo(
      WALLET_FLAP_FULL_OPEN_ANGLE_DEGREES / 2,
      6,
    );
  });

  it('支持弹簧过冲的进度（>1）线性外推渲染', () => {
    expect(walletFlapRotationDegrees(1.04)).toBeCloseTo(
      WALLET_FLAP_FULL_OPEN_ANGLE_DEGREES * 1.04,
      6,
    );
  });
});

describe('开启态扩展命中区（任务 extend-flap-hit-area）', () => {
  const STANDING_HEIGHT = 170; // 直立翻盖投影高度示例

  it('直立翻盖区域（钱包顶边上方）内的点命中', () => {
    expect(isPointInsideOpenFlapHitArea({ x: 190, y: 400 }, WALLET_RECT, STANDING_HEIGHT)).toBe(true); // 顶边(500)上方 100px
    expect(isPointInsideOpenFlapHitArea({ x: 190, y: 340 }, WALLET_RECT, STANDING_HEIGHT)).toBe(true); // 接近直立顶端
  });

  it('超出直立高度上方不命中', () => {
    expect(
      isPointInsideOpenFlapHitArea({ x: 190, y: WALLET_RECT.top - STANDING_HEIGHT - 20 }, WALLET_RECT, STANDING_HEIGHT),
    ).toBe(false);
  });

  it('钱包体内下半部仍不命中（纸币区不被劫持）', () => {
    expect(isPointInsideOpenFlapHitArea({ x: 190, y: 700 }, WALLET_RECT, STANDING_HEIGHT)).toBe(false);
  });
});
