import type { SafeAreaInsets } from '../platform';

export interface Rect { left: number; top: number; width: number; height: number }
export interface LetterSceneLayout {
  envelopeRect: Rect;
  /** 打开信封两侧袋口的纵向锚点。 */
  envelopeOpeningSideY: number;
  /** 打开信封前袋 V 形开口最低点的纵向锚点。 */
  envelopeOpeningNotchY: number;
  /** 横向对折后的整张可交互物；高度恒为完整信纸的一半。 */
  foldedCardRect: Rect;
  /** 对折信纸在信封口以上实际露出的区域。 */
  exposedCardRect: Rect;
  /** 抽取手势整块命中区：从露出信纸上缘到信封底边，含袋口锚线与信封外框之间的带状空隙。 */
  envelopeGrabRect: Rect;
  cardRect: Rect;
  burnCardRect: Rect;
  menuRect: Rect;
  safeContentRect: Rect;
  systemGestureBoundaryY: number;
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

// linglan 信纸原图为 1024×1536，卡片按原图比例呈现。
const LETTER_PAPER_HEIGHT_RATIO = 1536 / 1024;
export const ENVELOPE_ASSET_ANCHORS = {
  left: 0.064,
  right: 0.938,
  bottom: 0.95,
  openingSideY: 0.397,
  openingLeftX: 0.45,
  openingRightX: 0.555,
  openingNotchY: 0.66,
} as const;
const FOLDED_LETTER_EXPOSED_RATIO = 0.09;
const FOLDED_LETTER_NOTCH_INSERTION_RATIO = 0.25;
// 让折叠信纸真正落进袋腔；底边仍留 2px 安全余量，避免穿出信封轮廓。
const ENVELOPE_BOTTOM_CLEARANCE = 2;

export interface DispatchDialogLayout { panelRect: Rect; localButtonRect: Rect; sendButtonRect: Rect }

/** 上滑后的寄送抉择弹层：居中暖纸面板 + 两个纵排按钮；命中与绘制共用。 */
export function computeDispatchDialogLayout(viewportWidth: number, viewportHeight: number, safeArea: SafeAreaInsets): DispatchDialogLayout {
  const panelWidth = Math.min(300, viewportWidth - safeArea.left - safeArea.right - 40);
  const panelHeight = 168;
  const left = (viewportWidth - panelWidth) / 2;
  const top = Math.max(safeArea.top + 40, (viewportHeight - panelHeight) / 2 - 40);
  const buttonWidth = panelWidth - 48;
  return {
    panelRect: { left, top, width: panelWidth, height: panelHeight },
    localButtonRect: { left: left + 24, top: top + 72, width: buttonWidth, height: 40 },
    sendButtonRect: { left: left + 24, top: top + 120, width: buttonWidth, height: 40 },
  };
}

export function computeLetterSceneLayout(
  viewportWidth: number,
  viewportHeight: number,
  safeArea: SafeAreaInsets,
): LetterSceneLayout {
  const safeLeft = safeArea.left + 18;
  const safeRight = viewportWidth - safeArea.right - 18;
  const safeTop = safeArea.top + 14;
  const safeBottom = viewportHeight - safeArea.bottom - 22;
  const contentWidth = safeRight - safeLeft;
  const envelopeWidth = Math.min(318, contentWidth * 0.82);
  const envelopeHeight = Math.min(190, envelopeWidth * 0.58);
  const envelopeBottomGap = Math.min(54, Math.max(30, viewportHeight * 0.055));
  const envelopeRect = {
    left: (viewportWidth - envelopeWidth) / 2,
    top: safeBottom - envelopeHeight - envelopeBottomGap,
    width: envelopeWidth,
    height: envelopeHeight,
  };
  // 信纸的可见边缘应接近信封内侧开口；之前按 84% 外框宽度计算，再叠加素材透明边距，视觉上会明显偏窄。
  const cardTopFloor = safeTop + 8;
  let cardWidth = Math.min(310, contentWidth * 0.8, envelopeWidth * 0.92);
  let cardHeight = cardWidth * LETTER_PAPER_HEIGHT_RATIO;
  // 竖版信纸过高时以“信封上方可用空间”封顶，等比收窄以保持素材比例
  const maximumCardHeight = envelopeRect.top - 26 - cardTopFloor;
  if (cardHeight > maximumCardHeight) {
    cardHeight = maximumCardHeight;
    cardWidth = cardHeight / LETTER_PAPER_HEIGHT_RATIO;
  }
  const cardTop = Math.max(cardTopFloor, Math.min(viewportHeight * 0.31, envelopeRect.top - cardHeight - 30));
  const cardRect = { left: (viewportWidth - cardWidth) / 2, top: cardTop, width: cardWidth, height: cardHeight };
  // 信纸沿横向中线对折后装入信封。折叠物保持自然的半页高度，
  // 只露出约 9% 的可抓取上缘，其余部分由信封前袋遮挡。
  const envelopeAssetSize = envelopeRect.width / (ENVELOPE_ASSET_ANCHORS.right - ENVELOPE_ASSET_ANCHORS.left);
  const envelopeAssetTop = envelopeRect.top + envelopeRect.height - ENVELOPE_ASSET_ANCHORS.bottom * envelopeAssetSize;
  const openingSideY = envelopeAssetTop + ENVELOPE_ASSET_ANCHORS.openingSideY * envelopeAssetSize;
  const openingNotchY = envelopeAssetTop + ENVELOPE_ASSET_ANCHORS.openingNotchY * envelopeAssetSize;
  const envelopeBottomY = envelopeAssetTop + ENVELOPE_ASSET_ANCHORS.bottom * envelopeAssetSize;
  const foldedHeight = cardHeight / 2;
  const desiredBottom = openingSideY + foldedHeight * (1 - FOLDED_LETTER_EXPOSED_RATIO);
  const minimumInsertedBottom = openingNotchY + foldedHeight * FOLDED_LETTER_NOTCH_INSERTION_RATIO;
  const foldedBottom = Math.min(
    envelopeBottomY - ENVELOPE_BOTTOM_CLEARANCE,
    Math.max(desiredBottom, minimumInsertedBottom),
  );
  const foldedCardRect = {
    left: cardRect.left,
    top: foldedBottom - foldedHeight,
    width: cardWidth,
    height: foldedHeight,
  };
  const exposedCardRect = {
    left: foldedCardRect.left,
    top: foldedCardRect.top,
    width: cardWidth,
    height: Math.max(0, openingSideY - foldedCardRect.top),
  };
  // 命中区必须覆盖视觉上连成一体的「信纸上缘 + 信封」：袋口锚线（openingSideY）
  // 到信封外框顶边之间存在一段只画得到、摸不到的侧袋带，指腹落在那里时抽取无响应。
  const envelopeGrabTop = Math.min(foldedCardRect.top, envelopeRect.top);
  const envelopeGrabRect = {
    left: envelopeRect.left,
    top: envelopeGrabTop,
    width: envelopeRect.width,
    height: envelopeRect.top + envelopeRect.height - envelopeGrabTop,
  };
  const burnTop = Math.max(safeTop + 84, Math.min(cardTop, viewportHeight * 0.27));
  return {
    envelopeRect,
    envelopeOpeningSideY: openingSideY,
    envelopeOpeningNotchY: openingNotchY,
    foldedCardRect,
    exposedCardRect,
    envelopeGrabRect,
    cardRect,
    burnCardRect: { ...cardRect, top: burnTop },
    menuRect: { left: safeRight - 48, top: safeTop, width: 48, height: 48 },
    safeContentRect: { left: safeLeft, top: safeTop, width: contentWidth, height: safeBottom - safeTop },
    systemGestureBoundaryY: viewportHeight - safeArea.bottom - 18,
  };
}
