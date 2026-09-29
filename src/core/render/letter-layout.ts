import type { SafeAreaInsets } from '../platform';

export interface Rect { left: number; top: number; width: number; height: number }
export interface LetterSceneLayout {
  envelopeRect: Rect;
  /** 横向对折后的整张可交互物；高度恒为完整信纸的一半。 */
  foldedCardRect: Rect;
  /** 对折信纸在信封口以上实际露出的区域。 */
  exposedCardRect: Rect;
  cardRect: Rect;
  burnCardRect: Rect;
  menuRect: Rect;
  safeContentRect: Rect;
  systemGestureBoundaryY: number;
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

// 信纸素材内容包围盒为 491×733（背景已透明化），卡片按纸面自身比例呈现
const LETTER_PAPER_HEIGHT_RATIO = 733 / 491;

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
  const cardTopFloor = safeTop + 78;
  let cardWidth = Math.min(286, contentWidth * 0.72, envelopeWidth * 0.84);
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
  // 其中约 38% 露出开口，其余部分由信封前袋遮挡。
  const envelopeAssetSize = envelopeRect.width / 0.874;
  const openingSideY = envelopeRect.top + envelopeRect.height - (0.95 - 0.397) * envelopeAssetSize;
  const foldedHeight = cardHeight / 2;
  const foldedCardRect = {
    left: cardRect.left,
    top: openingSideY - foldedHeight * 0.38,
    width: cardWidth,
    height: foldedHeight,
  };
  const exposedCardRect = {
    left: foldedCardRect.left,
    top: foldedCardRect.top,
    width: cardWidth,
    height: Math.max(0, openingSideY - foldedCardRect.top),
  };
  const burnTop = Math.max(safeTop + 84, Math.min(cardTop, viewportHeight * 0.27));
  return {
    envelopeRect,
    foldedCardRect,
    exposedCardRect,
    cardRect,
    burnCardRect: { ...cardRect, top: burnTop },
    menuRect: { left: safeRight - 48, top: safeTop, width: 48, height: 48 },
    safeContentRect: { left: safeLeft, top: safeTop, width: contentWidth, height: safeBottom - safeTop },
    systemGestureBoundaryY: viewportHeight - safeArea.bottom - 18,
  };
}
