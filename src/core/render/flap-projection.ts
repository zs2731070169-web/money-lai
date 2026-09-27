/**
 * 翻盖条带透视投影（顶边铰链版，game-visuals 规格 v2.3）。
 *
 * 几何：铰链 = 钱包顶边；翻盖绕其在立体空间沿弧线翻转
 * （θ=0° 贴前面覆盖上半部 → 越过顶边 → θ=180° 直立于顶边上方、回到屏幕平面）。
 * 虚拟相机俯角 φ≈28°（自然桌面视角；φ_eff = φ·sinθ 随角度混入，闭合态 φ_eff=0
 * 保证对钱包面的完整覆盖）。
 *   条带参数 t∈[0,1]（0=铰链，1=自由边）：
 *   深度 z(t) = -t·L·sinθ（向后）
 *   透视 s(t) = f/(f - z(t))（f=3L；180° 时 z=0 → s=1 无透视 → 完整矩形）
 *   屏幕偏移 Y(t) = t·L·(cosθ·cosφ_eff − sinθ·sinφ_eff)（正=铰链下方）
 *   半宽 W(t) = (W/2)·s(t)
 * 材料厚度兜底：侧对视线时呈现 8% 翻盖长度的皮革切边，永不成线。
 */

import type { Rect } from '../wallet/flap-hit-test';

/** 虚拟相机俯角（度）：自然桌面视角 */
export const FLAP_CAMERA_PITCH_DEGREES = 28;

/** 皮革厚度兜底：最小投影展布比例（永不退化为一条线） */
export const FLAP_THICKNESS_MIN_SPREAD_RATIO = 0.08;

/** 接近侧对时才交接，避免过宽渐变留下大块半透明表面。 */
export const FLAP_FACE_FULL_SPREAD_RATIO = 0.18;

/** 焦距 = 焦距比率 × 翻盖长度 */
export const FLAP_PERSPECTIVE_FOCAL_LENGTH_RATIOS = 3;

/** 水平条带数（透视纹理映射的切片粒度） */
export const FLAP_STRIP_COUNT = 100;

/** 直立稳态角的下限（小屏自适应时最多微后仰到此角） */
export const FLAP_STANDING_MIN_ANGLE_DEGREES = 180;

export interface FlapProjectionSample {
  /** 距铰链的屏幕偏移（正=下方覆盖钱包面；负=上方翻起/直立） */
  offsetFromHingePixels: number;
  /** 投影半宽（像素） */
  halfWidthPixels: number;
  /** 透视缩放系数（1=无透视） */
  perspectiveScale: number;
}

export function projectFlapPointAtParameter(
  parameterT: number,
  foldAngleDegrees: number,
  flapLengthPixels: number,
  walletWidthPixels: number,
): FlapProjectionSample {
  const foldAngleRadians = (foldAngleDegrees * Math.PI) / 180;
  // 俯角随角度混入：闭合态（θ=0）为 0 → 翻盖完整覆盖钱包面；水平态（θ=90°）全俯角
  const effectivePitchRadians =
    ((FLAP_CAMERA_PITCH_DEGREES * Math.sin(foldAngleRadians)) * Math.PI) / 180;

  const depthPixels = parameterT * flapLengthPixels * Math.sin(foldAngleRadians);
  const focalLengthPixels = FLAP_PERSPECTIVE_FOCAL_LENGTH_RATIOS * flapLengthPixels;
  const perspectiveScale = focalLengthPixels / (focalLengthPixels - depthPixels);

  const offsetFromHingePixels =
    parameterT *
    flapLengthPixels *
    (Math.cos(foldAngleRadians) * Math.cos(effectivePitchRadians) -
      Math.sin(foldAngleRadians) * Math.sin(effectivePitchRadians));

  return {
    offsetFromHingePixels,
    halfWidthPixels: (walletWidthPixels / 2) * perspectiveScale,
    perspectiveScale,
  };
}

/** 翻盖整体投影展布比例（自由边偏移绝对值 / 翻盖长度） */
export function flapProjectedSpreadRatio(
  foldAngleDegrees: number,
  flapLengthPixels: number,
  walletWidthPixels: number,
): number {
  const freeEdgeSample = projectFlapPointAtParameter(
    1,
    foldAngleDegrees,
    flapLengthPixels,
    walletWidthPixels,
  );
  return Math.abs(freeEdgeSample.offsetFromHingePixels) / flapLengthPixels;
}

/** 材料厚度兜底：展布比例钳制到 ≥8%（侧对视线时永不成线）。 */
export function clampFlapSpreadRatioToThickness(spreadRatio: number): number {
  return Math.max(spreadRatio, FLAP_THICKNESS_MIN_SPREAD_RATIO);
}

/** 纹理表面在侧对区平滑淡出，正反面切换时均为不可见。 */
export function flapFaceVisibilityForSpread(spreadRatio: number): number {
  const normalized = Math.max(0, Math.min(1,
    (spreadRatio - FLAP_THICKNESS_MIN_SPREAD_RATIO) /
    (FLAP_FACE_FULL_SPREAD_RATIO - FLAP_THICKNESS_MIN_SPREAD_RATIO),
  ));
  return normalized * normalized * (3 - 2 * normalized);
}

/** 切边中心沿铰链到自由边的中点移动，正反面翻转时无跳位。 */
export function flapLeatherEdgeRect(
  walletRect: Rect,
  foldLineY: number,
  foldAngleDegrees: number,
): Rect {
  const flapLengthPixels = foldLineY - walletRect.top;
  const freeEdge = projectFlapPointAtParameter(
    1, foldAngleDegrees, flapLengthPixels, walletRect.width,
  );
  const height = flapLengthPixels * FLAP_THICKNESS_MIN_SPREAD_RATIO;
  const width = walletRect.width;
  return {
    left: walletRect.left,
    top: walletRect.top + freeEdge.offsetFromHingePixels / 2 - height / 2,
    width,
    height,
  };
}

/** 侧对渐隐时收拢透视自由边的水平范围，避免半透明三角残影。 */
export function flapFaceTransitionClipRect(
  walletRect: Rect,
  foldLineY: number,
  foldAngleDegrees: number,
  faceVisibility: number,
): Rect {
  const flapLengthPixels = foldLineY - walletRect.top;
  const freeEdge = projectFlapPointAtParameter(
    1, foldAngleDegrees, flapLengthPixels, walletRect.width,
  );
  const fullWidth = Math.max(walletRect.width, freeEdge.halfWidthPixels * 2);
  const visibleWidth = walletRect.width +
    (fullWidth - walletRect.width) * Math.max(0, Math.min(1, faceVisibility));
  return {
    left: walletRect.left + (walletRect.width - visibleWidth) / 2,
    top: walletRect.top - flapLengthPixels,
    width: visibleWidth,
    height: flapLengthPixels * 2,
  };
}

/** 是否呈现背面（内衬朝观众）：自由边已翻到铰链上方 */
export function isFlapBackFaceVisible(
  foldAngleDegrees: number,
  flapLengthPixels: number,
  walletWidthPixels: number,
): boolean {
  return (
    projectFlapPointAtParameter(1, foldAngleDegrees, flapLengthPixels, walletWidthPixels)
      .offsetFromHingePixels < 0
  );
}

/**
 * 直立稳态角自适应：可用高度（铰链上方到金额里程表底部的净空）→ [150°,180°]。
 * 空间充足 = 180° 完整直立；不足则微后仰（≥150°），保证不遮挡计数器。
 */
export function resolveFlapStandingAngleDegrees(
  availableHeightPixels: number,
  flapLengthPixels: number,
): number {
  const heightRatio = Math.min(
    1,
    Math.max(0, availableHeightPixels / Math.max(1, flapLengthPixels)),
  );
  // |cosθ| = ratio → θ = 180° − acos(ratio)（ratio=1 → 180°；0.866 → 150°）
  const standingAngle = 180 - (Math.acos(heightRatio) * 180) / Math.PI;
  return Math.min(180, Math.max(FLAP_STANDING_MIN_ANGLE_DEGREES, standingAngle));
}
