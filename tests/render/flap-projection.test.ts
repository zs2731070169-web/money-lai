import { describe, expect, it } from 'vitest';
import {
  FLAP_CAMERA_PITCH_DEGREES,
  FLAP_PERSPECTIVE_FOCAL_LENGTH_RATIOS,
  FLAP_STANDING_MIN_ANGLE_DEGREES,
  FLAP_STRIP_COUNT,
  FLAP_THICKNESS_MIN_SPREAD_RATIO,
  FLAP_FACE_FULL_SPREAD_RATIO,
  flapFaceVisibilityForSpread,
  flapFaceTransitionClipRect,
  flapLeatherEdgeRect,
  clampFlapSpreadRatioToThickness,
  flapProjectedSpreadRatio,
  isFlapBackFaceVisible,
  projectFlapPointAtParameter,
  resolveFlapStandingAngleDegrees,
} from '../../src/core/render/flap-projection';

/**
 * 翻盖条带透视投影单测（任务 12.1，game-visuals「折叠的三维空间呈现 v2.3」）：
 * 闭合全覆盖、自由边弧线越过顶边、180° 完整矩形无透视、厚度兜底永不成线、直立自适应。
 */

const FLAP_LENGTH = 128;
const WALLET_WIDTH = 209;

describe('端点几何', () => {
  it('θ=0 闭合态：俯角未混入，翻盖完整覆盖钱包面（偏移 = +t·L、无透视）', () => {
    for (const parameterT of [0, 0.5, 1]) {
      const sample = projectFlapPointAtParameter(parameterT, 0, FLAP_LENGTH, WALLET_WIDTH);
      expect(sample.offsetFromHingePixels).toBeCloseTo(parameterT * FLAP_LENGTH, 5);
      expect(sample.halfWidthPixels).toBeCloseTo(WALLET_WIDTH / 2, 5);
      expect(sample.perspectiveScale).toBeCloseTo(1, 5);
    }
  });

  it('θ=180° 直立态：深度归零 → 完整矩形、无透视压缩（实测反馈：不是缩短的梯形）', () => {
    const freeEdge = projectFlapPointAtParameter(1, 180, FLAP_LENGTH, WALLET_WIDTH);
    expect(freeEdge.offsetFromHingePixels).toBeCloseTo(-FLAP_LENGTH, 5);
    expect(freeEdge.halfWidthPixels).toBeCloseTo(WALLET_WIDTH / 2, 5);
    expect(freeEdge.perspectiveScale).toBeCloseTo(1, 5);
  });

  it('θ=90° 水平态：俯角全效 → 自由边在铰链上方约半高（桌面俯视效果，不成线）', () => {
    const freeEdge = projectFlapPointAtParameter(1, 90, FLAP_LENGTH, WALLET_WIDTH);
    const expectedHeight = FLAP_LENGTH * Math.sin((FLAP_CAMERA_PITCH_DEGREES * Math.PI) / 180);
    expect(freeEdge.offsetFromHingePixels).toBeCloseTo(-expectedHeight, 4);
    expect(Math.abs(freeEdge.offsetFromHingePixels)).toBeGreaterThan(FLAP_LENGTH * 0.4);
  });

  it('设计常量符合规格（f=3L、条带 100、俯角 28°、切边 8%、直立恒 180°）', () => {
    expect(FLAP_PERSPECTIVE_FOCAL_LENGTH_RATIOS).toBe(3);
    expect(FLAP_STRIP_COUNT).toBe(100);
    expect(FLAP_CAMERA_PITCH_DEGREES).toBe(28);
    expect(FLAP_THICKNESS_MIN_SPREAD_RATIO).toBe(0.08);
    expect(FLAP_FACE_FULL_SPREAD_RATIO).toBe(0.18);
    expect(FLAP_STANDING_MIN_ANGLE_DEGREES).toBe(180);
  });
});

describe('弧线轨迹与透视', () => {
  it('自由边偏移随 θ 连续变化：+L → 0 → −L（无跳变，越过顶边）', () => {
    let previousOffset = FLAP_LENGTH;
    let signChanges = 0;
    let previousSign = 1;
    for (let angleDegrees = 0; angleDegrees <= 180; angleDegrees += 5) {
      const sample = projectFlapPointAtParameter(1, angleDegrees, FLAP_LENGTH, WALLET_WIDTH);
      expect(Math.abs(sample.offsetFromHingePixels - previousOffset)).toBeLessThan(
        FLAP_LENGTH * 0.35,
      ); // 步进连续
      const sign = Math.sign(sample.offsetFromHingePixels);
      if (sign !== previousSign && sign !== 0) signChanges += 1;
      if (sign !== 0) previousSign = sign;
      previousOffset = sample.offsetFromHingePixels;
    }
    expect(signChanges).toBe(1); // 恰好越过顶边一次
    expect(previousOffset).toBeCloseTo(-FLAP_LENGTH, 5);
  });

  it('中段角度存在透视梯形畸变（自由边与铰链处宽度显著不同）', () => {
    const atHinge = projectFlapPointAtParameter(0, 60, FLAP_LENGTH, WALLET_WIDTH);
    const atFreeEdge = projectFlapPointAtParameter(1, 60, FLAP_LENGTH, WALLET_WIDTH);
    const widthRatio = atFreeEdge.halfWidthPixels / atHinge.halfWidthPixels;
    // 手调定稿几何下自由边更宽（>8% 差异即构成可见梯形畸变；窄/宽方向均可）
    expect(Math.abs(widthRatio - 1)).toBeGreaterThan(0.08);
  });

  it('背面可见性在越过顶边后翻转', () => {
    expect(isFlapBackFaceVisible(0, FLAP_LENGTH, WALLET_WIDTH)).toBe(false);
    expect(isFlapBackFaceVisible(50, FLAP_LENGTH, WALLET_WIDTH)).toBe(false);
    expect(isFlapBackFaceVisible(75, FLAP_LENGTH, WALLET_WIDTH)).toBe(true);
    expect(isFlapBackFaceVisible(180, FLAP_LENGTH, WALLET_WIDTH)).toBe(true);
  });
});

describe('厚度兜底：全程不成线', () => {
  it('任意角度的展布比例经厚度钳制后 ≥8%', () => {
    for (let angleDegrees = 0; angleDegrees <= 180; angleDegrees += 5) {
      const rawSpread = flapProjectedSpreadRatio(angleDegrees, FLAP_LENGTH, WALLET_WIDTH);
      const clampedSpread = clampFlapSpreadRatioToThickness(rawSpread);
      expect(clampedSpread).toBeGreaterThanOrEqual(FLAP_THICKNESS_MIN_SPREAD_RATIO);
    }
  });

  it('表面可见度在 8% 到 18% 展布之间连续变化', () => {
    expect(flapFaceVisibilityForSpread(0)).toBe(0);
    expect(flapFaceVisibilityForSpread(0.08)).toBe(0);
    expect(flapFaceVisibilityForSpread(0.18)).toBe(1);
    let previous = 0;
    for (let spread = 0.08; spread <= 0.18; spread += 0.01) {
      const visibility = flapFaceVisibilityForSpread(spread);
      expect(visibility).toBeGreaterThanOrEqual(previous);
      previous = visibility;
    }
    expect(flapFaceVisibilityForSpread(0.13)).toBeGreaterThan(0);
    expect(flapFaceVisibilityForSpread(0.13)).toBeLessThan(1);
  });

  it('侧对切边始终围绕铰链，正反面切换时不跳位', () => {
    const walletRect = { left: 97, top: 367, width: 209, height: 386 };
    for (const angle of [50, 60, 70, 80]) {
      const edge = flapLeatherEdgeRect(walletRect, 541, angle);
      expect(edge.height).toBeCloseTo(174 * 0.08, 5);
      const freeEdge = projectFlapPointAtParameter(1, angle, 174, 209);
      expect(edge.width).toBe(walletRect.width);
      expect(edge.top + edge.height / 2).toBeCloseTo(
        walletRect.top + freeEdge.offsetFromHingePixels / 2, 5,
      );
    }
  });

  it('表面渐隐时水平范围收至钱包宽度，不留透视三角残影', () => {
    const walletRect = { left: 97, top: 367, width: 209, height: 386 };
    const full = flapFaceTransitionClipRect(walletRect, 541, 60, 1);
    const faded = flapFaceTransitionClipRect(walletRect, 541, 60, 0.1);
    const edge = flapFaceTransitionClipRect(walletRect, 541, 60, 0);
    expect(full.width).toBeGreaterThan(walletRect.width);
    expect(faded.width).toBeLessThan(full.width);
    expect(edge.width).toBe(walletRect.width);
  });
});

describe('直立稳态自适应', () => {
  it('直立下限 180°（实测定稿：恒完整直立、不后仰自适应）', () => {
    expect(resolveFlapStandingAngleDegrees(FLAP_LENGTH, FLAP_LENGTH)).toBe(180);
    expect(resolveFlapStandingAngleDegrees(FLAP_LENGTH * 0.5, FLAP_LENGTH)).toBe(180);
    expect(resolveFlapStandingAngleDegrees(FLAP_LENGTH * 0.1, FLAP_LENGTH)).toBe(180);
  });

  it('自适应结果随可用高度单调不减', () => {
    let previousAngle = 150;
    for (let ratio = 0.5; ratio <= 1.001; ratio += 0.05) {
      const angle = resolveFlapStandingAngleDegrees(FLAP_LENGTH * ratio, FLAP_LENGTH);
      expect(angle).toBeGreaterThanOrEqual(previousAngle - 1e-9);
      previousAngle = angle;
    }
  });
});
