/**
 * 翻盖命中区域与角度映射（wallet-interaction 规格的几何判定部分）。
 *
 * 坐标为逻辑像素；钱包布局矩形由渲染层依据视口与安全区计算后传入，
 * 本模块只做纯几何判定，便于单测与未来多端复用。
 */

/** 翻盖热区占钱包高度的比例（竖屏钱包翻盖位于上半部） */
/** 钱包折线在钱包高度中的比例（单一事实源：场景布局的折线与翻盖触发热区共用，
 *  实测反馈教训：热区自带 0.45 影子副本，折线下移到 0.55 后中间出现 ~35px 死区） */
export const WALLET_FOLD_HEIGHT_RATIO = 0.55;

/** 热区四周的宽容余量（逻辑像素）：无需精确按住即可交互 */
export const WALLET_FLAP_HIT_AREA_MARGIN = 12;

/** 全开时翻盖旋转角（度，顶边铰链直立稳态） */
export const WALLET_FLAP_FULL_OPEN_ANGLE_DEGREES = 180;

/** 逻辑平面点 */
export interface Point2D {
  x: number;
  y: number;
}

/** 钳制到 [0, 1] 区间（进度/比例通用，全内核唯一实现） */
export function clampToUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 轴对齐矩形 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 判定点是否落在翻盖交互热区（钱包上半部 + 四周余量扩边）——关闭态翻盖位置 */
export function isPointInsideFlapHitArea(point: Point2D, walletRect: Rect): boolean {
  const hitAreaLeft = walletRect.left - WALLET_FLAP_HIT_AREA_MARGIN;
  const hitAreaTop = walletRect.top - WALLET_FLAP_HIT_AREA_MARGIN;
  const hitAreaRight =
    walletRect.left + walletRect.width + WALLET_FLAP_HIT_AREA_MARGIN;
  const hitAreaBottom =
    walletRect.top + walletRect.height * WALLET_FOLD_HEIGHT_RATIO + WALLET_FLAP_HIT_AREA_MARGIN;

  return (
    point.x >= hitAreaLeft &&
    point.x <= hitAreaRight &&
    point.y >= hitAreaTop &&
    point.y <= hitAreaBottom
  );
}


/**
 * 开启态翻盖交互热区：钱包体内上半部 ∪ 直立于钱包上方的翻盖投影范围
 * （实测反馈：拖住直立翻盖下滑关闭不可达——命中区必须跟随翻盖实际位置）。
 * standingFlapHeightPixels 为直立翻盖在铰链上方的投影高度（由调用方按当前角度计算）。
 */
export function isPointInsideOpenFlapHitArea(
  point: Point2D,
  walletRect: Rect,
  standingFlapHeightPixels: number,
): boolean {
  const hitAreaLeft = walletRect.left - WALLET_FLAP_HIT_AREA_MARGIN;
  const hitAreaRight = walletRect.left + walletRect.width + WALLET_FLAP_HIT_AREA_MARGIN;
  const hitAreaTop = walletRect.top - standingFlapHeightPixels - WALLET_FLAP_HIT_AREA_MARGIN;
  const hitAreaBottom =
    walletRect.top +
    walletRect.height * WALLET_FOLD_HEIGHT_RATIO +
    WALLET_FLAP_HIT_AREA_MARGIN;
  return (
    point.x >= hitAreaLeft &&
    point.x <= hitAreaRight &&
    point.y >= hitAreaTop &&
    point.y <= hitAreaBottom
  );
}

/** 开合进度（0~1，允许弹簧过冲 >1）→ 翻盖旋转角（度），线性映射 */
export function walletFlapRotationDegrees(openProgress: number): number {
  return openProgress * WALLET_FLAP_FULL_OPEN_ANGLE_DEGREES;
}
