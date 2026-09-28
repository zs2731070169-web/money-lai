import type { SafeAreaInsets } from '../platform';

export interface Rect { left: number; top: number; width: number; height: number }
export interface LetterSceneLayout {
  envelopeRect: Rect;
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
  // 静置时露出信封开口的是对折信纸的上缘
  const exposedCardRect = {
    left: cardRect.left,
    top: envelopeRect.top - 18,
    width: cardWidth,
    height: Math.min(46, cardHeight / 2),
  };
  const burnTop = Math.max(safeTop + 84, Math.min(cardTop, viewportHeight * 0.27));
  return {
    envelopeRect,
    exposedCardRect,
    cardRect,
    burnCardRect: { ...cardRect, top: burnTop },
    menuRect: { left: safeRight - 48, top: safeTop, width: 48, height: 48 },
    safeContentRect: { left: safeLeft, top: safeTop, width: contentWidth, height: safeBottom - safeTop },
    systemGestureBoundaryY: viewportHeight - safeArea.bottom - 18,
  };
}
