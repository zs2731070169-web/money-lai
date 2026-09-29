import { COPY } from '../content/copy';
import type { BurningState } from '../letter/burning-state';
import { UNFOLD_DURATION_MS, afterglowVisual, burnProgress, statAlpha } from '../letter/burning-state';
import { patternById, type PostcardPattern } from '../letter/patterns';
import { APPEARANCES } from '../meta/postcard-progress';
import type { LetterSceneLayout, Rect } from './letter-layout';
import type { BurnGeometryBuffer } from './burn-geometry';
import { updateBurnGeometryInto } from './burn-geometry';
import { BACKGROUND_SOURCE_HEIGHT as BACKGROUND_PIXEL_HEIGHT, BACKGROUND_SOURCE_WIDTH as BACKGROUND_PIXEL_WIDTH } from './background-composition';

export const OUTER_FLAME_COLOR = '#D85A30';
export const INNER_FLAME_COLOR = '#BA7517';
const INK = '#495853';
const ENVELOPE_LEFT = 0.064;
const ENVELOPE_RIGHT = 0.938;
const ENVELOPE_BOTTOM = 0.95;
const ENVELOPE_OPENING_SIDE_Y = 0.397;
const ENVELOPE_OPENING_LEFT_X = 0.45;
const ENVELOPE_OPENING_RIGHT_X = 0.555;
const ENVELOPE_OPENING_NOTCH_Y = 0.66;

export interface LetterSceneAssets {
  background?: CanvasImageSource | null;
  /** 竖屏下按视口离屏合成的背景（视口比例、整幅拉伸绘制），优先于 background。 */
  backgroundComposed?: CanvasImageSource | null;
  closedEnvelope?: CanvasImageSource | null;
  openEnvelope?: CanvasImageSource | null;
  letterPaper?: CanvasImageSource | null;
}

function appearanceFilter(id: string): string {
  switch (id) {
    case 'envelope-rose': return 'sepia(0.08) saturate(0.82) hue-rotate(325deg) brightness(1.02)';
    case 'envelope-moss': return 'sepia(0.1) saturate(0.72) hue-rotate(52deg) brightness(0.98)';
    case 'envelope-night': return 'sepia(0.08) saturate(0.66) hue-rotate(150deg) brightness(0.91)';
    case 'paper-fiber': return 'sepia(0.07) saturate(0.86) brightness(0.99)';
    case 'paper-sand': return 'sepia(0.14) saturate(0.88) brightness(0.97)';
    case 'paper-mist': return 'saturate(0.7) brightness(1.035)';
    default: return 'none';
  }
}

function paintCoverImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / BACKGROUND_PIXEL_WIDTH, height / BACKGROUND_PIXEL_HEIGHT);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceLeft = (BACKGROUND_PIXEL_WIDTH - sourceWidth) / 2;
  const sourceTop = (BACKGROUND_PIXEL_HEIGHT - sourceHeight) / 2;
  context.drawImage(image, sourceLeft, sourceTop, sourceWidth, sourceHeight, 0, 0, width, height);
}

/**
 * 背景整体提亮洗：暖白低透明度全屏叠加，拉开背景与信封/信纸前景的明度层次。
 * 三条背景路径（合成位图/cover 回退/纯色兜底）统一在收尾叠加，每帧仅一次 fillRect。
 */
const BACKGROUND_LIGHTEN_WASH_COLOR = '#FFF9F0';
const BACKGROUND_LIGHTEN_WASH_ALPHA = 0.16;

export function paintPaperBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background?: CanvasImageSource | null,
  backgroundComposed?: CanvasImageSource | null,
): void {
  // 已合成背景与视口同比例：整幅拉伸（经 DPR 变换后近似 1:1 像素映射）
  if (backgroundComposed) {
    context.drawImage(backgroundComposed, 0, 0, width, height);
  } else if (background) {
    paintCoverImage(context, background, width, height);
  } else {
    context.fillStyle = '#F1E7DB';
    context.fillRect(0, 0, width, height);
  }
  context.globalAlpha = BACKGROUND_LIGHTEN_WASH_ALPHA;
  context.fillStyle = BACKGROUND_LIGHTEN_WASH_COLOR;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1;
}

/** 图鉴图案是印在真实信纸上的克制墨层，不再充当纸张本身。 */
export function paintPatternArt(
  context: CanvasRenderingContext2D,
  rect: Rect,
  pattern: PostcardPattern,
  paintBackground = true,
): void {
  const variation = ((pattern.seed % 11) - 5) / 5;
  const cx = rect.left + rect.width / 2 + variation * rect.width * 0.035;
  const cy = rect.top + rect.height / 2 - variation * rect.height * 0.025;
  context.save();
  if (paintBackground) {
    context.fillStyle = pattern.background; context.globalAlpha = 0.2;
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
  }
  context.globalAlpha = 0.48;
  context.strokeStyle = pattern.foreground; context.fillStyle = pattern.foreground;
  context.lineWidth = Math.max(1, rect.width * 0.008);
  switch (pattern.motif) {
    case 'sun':
      context.beginPath(); context.arc(cx, cy, rect.height * 0.16, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 0.24; context.beginPath(); context.arc(cx, cy, rect.height * 0.27, 0, Math.PI * 2); context.stroke(); break;
    case 'hill':
      context.beginPath(); context.moveTo(rect.left, rect.top + rect.height * 0.72);
      context.quadraticCurveTo(rect.left + rect.width * 0.28, rect.top + rect.height * 0.25, cx, rect.top + rect.height * 0.7);
      context.quadraticCurveTo(rect.left + rect.width * 0.78, rect.top + rect.height * 0.38, rect.left + rect.width, rect.top + rect.height * 0.75);
      context.lineTo(rect.left + rect.width, rect.top + rect.height); context.lineTo(rect.left, rect.top + rect.height); context.closePath(); context.fill(); break;
    case 'leaf':
      for (let index = 0; index < 5; index += 1) {
        const x = rect.left + rect.width * (0.2 + index * 0.15) + variation * index;
        const y = rect.top + rect.height * (0.7 - (index % 2) * 0.18) + variation * 3;
        context.beginPath(); context.ellipse(x, y, rect.width * 0.045, rect.height * 0.12, -0.55, 0, Math.PI * 2); context.fill();
      } break;
    case 'wave':
      for (let row = 0; row < 4; row += 1) {
        const y = rect.top + rect.height * (0.27 + row * 0.13);
        context.beginPath(); context.moveTo(rect.left + rect.width * 0.08, y);
        context.bezierCurveTo(cx - rect.width * 0.14, y - rect.height * 0.12, cx + rect.width * 0.1, y + rect.height * 0.12, rect.left + rect.width * 0.92, y); context.stroke();
      } break;
    case 'rain':
      for (let index = 0; index < 12; index += 1) {
        const x = rect.left + rect.width * (0.12 + (index % 6) * 0.15);
        const y = rect.top + rect.height * (0.22 + Math.floor(index / 6) * 0.34);
        context.beginPath(); context.moveTo(x, y); context.lineTo(x - rect.width * 0.03, y + rect.height * 0.1); context.stroke();
      } break;
    case 'window': {
      const size = Math.min(rect.width, rect.height) * 0.42;
      context.strokeRect(cx - size / 2, cy - size / 2, size, size);
      context.beginPath(); context.moveTo(cx, cy - size / 2); context.lineTo(cx, cy + size / 2);
      context.moveTo(cx - size / 2, cy); context.lineTo(cx + size / 2, cy); context.stroke(); break;
    }
  }
  context.globalAlpha = 0.36; context.fillStyle = pattern.accent;
  context.fillRect(rect.left, rect.top + rect.height - Math.max(3, rect.height * 0.035), rect.width, Math.max(3, rect.height * 0.035));
  context.restore();
}

// 信纸素材取样窗口：515×790 RGBA（背景已透明化），窗口为纸面内容包围盒 (13,15)-(503,747)
const LETTER_PAPER_SOURCE_LEFT = 13;
const LETTER_PAPER_SOURCE_TOP = 15;
const LETTER_PAPER_SOURCE_WIDTH = 491;
const LETTER_PAPER_SOURCE_HEIGHT = 733;

function paperAppearance(id: string) {
  return APPEARANCES.find((item) => item.id === id && item.kind === 'paper') ?? APPEARANCES[4];
}

function paintLetterPaperRegion(
  context: CanvasRenderingContext2D,
  rect: Rect,
  sourceTop: number,
  sourceHeight: number,
  image?: CanvasImageSource | null,
  paperId = 'paper-plain',
): void {
  if (!image) {
    context.fillStyle = paperAppearance(paperId).base;
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
    return;
  }
  context.save(); context.filter = appearanceFilter(paperId);
  context.drawImage(
    image,
    LETTER_PAPER_SOURCE_LEFT, LETTER_PAPER_SOURCE_TOP + sourceTop, LETTER_PAPER_SOURCE_WIDTH, sourceHeight,
    rect.left, rect.top, rect.width, rect.height,
  );
  context.restore();
}

export function paintLetterPaperAsset(
  context: CanvasRenderingContext2D,
  rect: Rect,
  image?: CanvasImageSource | null,
  paperId = 'paper-plain',
): void {
  paintLetterPaperRegion(context, rect, 0, LETTER_PAPER_SOURCE_HEIGHT, image, paperId);
}

/** 菜单外观预览也直接取真实信封位图，只施加与主场景相同的克制色调。 */
export function paintEnvelopeAssetPreview(
  context: CanvasRenderingContext2D,
  rect: Rect,
  image?: CanvasImageSource | null,
  appearanceId = 'envelope-kraft',
): void {
  if (!image) return;
  context.save(); context.filter = appearanceFilter(appearanceId);
  context.drawImage(image, rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

function paintCardFace(
  context: CanvasRenderingContext2D,
  rect: Rect,
  patternId: string,
  paperId: string,
  back: boolean,
  text: string,
  prompt: string,
  letterPaper?: CanvasImageSource | null,
): void {
  context.save();
  context.shadowColor = 'rgba(76,53,38,.18)'; context.shadowBlur = 18; context.shadowOffsetY = 7;
  paintLetterPaperAsset(context, rect, letterPaper, paperId);
  context.shadowColor = 'transparent';
  if (!back) {
    const inset = Math.max(7, rect.width * 0.035);
    paintPatternArt(context, { left: rect.left + inset, top: rect.top + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 }, patternById(patternId), false);
  } else {
    context.save(); context.globalAlpha = 0.28; context.fillStyle = '#F7EFE3'; context.fillRect(rect.left + 8, rect.top + 8, rect.width - 16, rect.height - 16); context.restore();
    context.strokeStyle = 'rgba(107,91,73,.24)'; context.lineWidth = 1;
    for (let y = rect.top + rect.height * 0.48; y < rect.top + rect.height - 25; y += 28) { context.beginPath(); context.moveTo(rect.left + 24, y); context.lineTo(rect.left + rect.width - 24, y); context.stroke(); }
    context.fillStyle = INK; context.textAlign = 'left'; context.textBaseline = 'top';
    context.globalAlpha = text ? 0.92 : 0.32; context.font = "15px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(text || prompt, rect.left + 25, rect.top + 32, rect.width - 50);
  }
  context.restore();
}

export function computeEnvelopeAssetRect(rect: Rect): Rect {
  const size = rect.width / (ENVELOPE_RIGHT - ENVELOPE_LEFT);
  return {
    left: rect.left + rect.width / 2 - size / 2,
    top: rect.top + rect.height - ENVELOPE_BOTTOM * size,
    width: size,
    height: size,
  };
}

function paintEnvelopeAssetBack(context: CanvasRenderingContext2D, rect: Rect, image: CanvasImageSource, appearanceId: string): void {
  const target = computeEnvelopeAssetRect(rect);
  context.save();
  context.shadowColor = 'rgba(77,55,39,.2)'; context.shadowBlur = 20; context.shadowOffsetY = 8;
  context.filter = appearanceFilter(appearanceId);
  context.drawImage(image, target.left, target.top, target.width, target.height);
  context.restore();
}

function paintEnvelopeAssetFront(context: CanvasRenderingContext2D, rect: Rect, image: CanvasImageSource, appearanceId: string): void {
  const target = computeEnvelopeAssetRect(rect);
  const x = (ratio: number) => target.left + ratio * target.width;
  const y = (ratio: number) => target.top + ratio * target.height;
  context.save();
  context.beginPath();
  context.moveTo(x(ENVELOPE_LEFT), y(ENVELOPE_OPENING_SIDE_Y));
  context.lineTo(x(ENVELOPE_OPENING_LEFT_X), y(ENVELOPE_OPENING_NOTCH_Y));
  context.lineTo(x(ENVELOPE_OPENING_RIGHT_X), y(ENVELOPE_OPENING_NOTCH_Y));
  context.lineTo(x(ENVELOPE_RIGHT), y(ENVELOPE_OPENING_SIDE_Y));
  context.lineTo(x(ENVELOPE_RIGHT), y(ENVELOPE_BOTTOM));
  context.lineTo(x(ENVELOPE_LEFT), y(ENVELOPE_BOTTOM));
  context.closePath(); context.clip();
  context.filter = appearanceFilter(appearanceId);
  context.drawImage(image, target.left, target.top, target.width, target.height);
  context.restore();
}

function paintBurningCard(context: CanvasRenderingContext2D, rect: Rect, patternId: string, paperId: string, geometry: BurnGeometryBuffer, letterPaper?: CanvasImageSource | null): void {
  context.save();
  context.beginPath(); context.moveTo(rect.left, rect.top + rect.height); context.lineTo(rect.left + rect.width, rect.top + rect.height);
  for (let index = geometry.lineX.length - 1; index >= 0; index -= 1) context.lineTo(geometry.lineX[index], geometry.lineY[index]);
  context.closePath(); context.clip();
  paintCardFace(context, rect, patternId, paperId, false, '', '', letterPaper); context.restore();
  context.save(); context.lineJoin = 'round'; context.lineCap = 'round'; context.beginPath(); context.moveTo(geometry.lineX[0], geometry.lineY[0] + 3);
  for (let index = 1; index < geometry.lineX.length; index += 1) context.lineTo(geometry.lineX[index], geometry.lineY[index]);
  context.strokeStyle = '#49372F'; context.lineWidth = 11; context.globalAlpha = 0.86; context.stroke();
  context.beginPath(); context.moveTo(geometry.lineX[0], geometry.lineY[0] - 4);
  for (let index = 1; index < geometry.lineX.length; index += 1) {
    const tongueLift = 4 + Math.abs(Math.sin(index * 1.73)) * 7;
    context.lineTo(geometry.lineX[index], geometry.lineY[index] - tongueLift);
  }
  context.shadowColor = 'rgba(216,90,48,.34)'; context.shadowBlur = 8;
  context.strokeStyle = OUTER_FLAME_COLOR; context.lineWidth = 11; context.globalAlpha = 0.82; context.stroke();
  context.shadowBlur = 0; context.strokeStyle = INNER_FLAME_COLOR; context.lineWidth = 4; context.globalAlpha = 0.94; context.stroke();
  context.strokeStyle = '#E5C3A2'; context.lineWidth = 1.4; context.globalAlpha = 0.72;
  for (let index = 4; index < geometry.lineX.length - 2; index += 9) {
    context.beginPath(); context.moveTo(geometry.lineX[index], geometry.lineY[index] + 3);
    context.quadraticCurveTo(geometry.lineX[index] + 5, geometry.lineY[index] - 7, geometry.lineX[index] + 11, geometry.lineY[index] + 2); context.stroke();
  }
  context.restore();
  context.save(); context.globalAlpha = Math.max(0, 0.2 * (1 - geometry.progress)); context.fillStyle = '#C9C4BB';
  for (let index = 0; index < geometry.stripOffsetX.length; index += 1) {
    const width = rect.width / geometry.stripOffsetX.length;
    context.fillRect(rect.left + index * width + geometry.stripOffsetX[index], rect.top + geometry.stripOffsetY[index], width + 2, Math.max(0, rect.height * geometry.progress - 8));
  }
  context.restore();
}

export interface LetterScenePaintOptions {
  width: number; height: number; layout: LetterSceneLayout; state: BurningState; patternId: string;
  prompt: string; envelopeAppearanceId: string; paperAppearanceId: string; burnGeometry: BurnGeometryBuffer; burnSeed: number;
  menuGlowProgress: number;
  assets?: LetterSceneAssets;
}

function paintFoldedTop(
  context: CanvasRenderingContext2D,
  foldedRect: Rect,
  patternId: string,
  paperId: string,
  letterPaper?: CanvasImageSource | null,
  creaseAlpha = 1,
): void {
  paintLetterPaperRegion(context, foldedRect, 0, LETTER_PAPER_SOURCE_HEIGHT / 2, letterPaper, paperId);
  const inset = Math.max(7, foldedRect.width * 0.035);
  const logicalFull = { left: foldedRect.left + inset, top: foldedRect.top + inset, width: foldedRect.width - inset * 2, height: foldedRect.height * 2 - inset * 2 };
  context.save(); context.beginPath(); context.rect(foldedRect.left, foldedRect.top, foldedRect.width, foldedRect.height); context.clip();
  paintPatternArt(context, logicalFull, patternById(patternId), false); context.restore();
  if (creaseAlpha > 0) {
    const crease = foldedRect.top + foldedRect.height;
    const gradient = context.createLinearGradient(0, crease - 18, 0, crease);
    gradient.addColorStop(0, 'rgba(73,55,47,0)'); gradient.addColorStop(1, `rgba(73,55,47,${0.15 * creaseAlpha})`);
    context.fillStyle = gradient; context.fillRect(foldedRect.left, crease - 18, foldedRect.width, 18);
    context.fillStyle = `rgba(73,55,47,${0.22 * creaseAlpha})`; context.fillRect(foldedRect.left, crease - 1, foldedRect.width, 1);
  }
}

/** 抽取时保持自然半页高的对折态；过阈值松手后，下半页才从折痕展开。 */
function paintFoldedLetter(context: CanvasRenderingContext2D, options: LetterScenePaintOptions): void {
  const { state, layout } = options;
  const startTop = layout.foldedCardRect.top + state.offsetY;
  const progress = state.phase === 'unfold'
    ? Math.max(0, Math.min(1, state.elapsedMs / UNFOLD_DURATION_MS))
    : 0;
  // 自动段明确分成“先把折纸完全抽离信封，再打开下半页”两段，
  // 避免纸张仍被前袋夹住时就在信封里展开。
  const extractionProgress = Math.min(1, progress / 0.32);
  const extractionEased = 1 - Math.pow(1 - extractionProgress, 3);
  const unfoldProgress = Math.max(0, Math.min(1, (progress - 0.32) / 0.68));
  const unfoldEased = 1 - Math.pow(1 - unfoldProgress, 3);
  const top = startTop + (layout.cardRect.top - startTop) * extractionEased;
  const halfHeight = layout.cardRect.height / 2;
  const foldedRect = { left: layout.cardRect.left, top, width: layout.cardRect.width, height: halfHeight };
  const crease = top + halfHeight;
  const tiltDegrees = state.tiltDegrees * (1 - extractionEased);
  context.save();
  context.translate(foldedRect.left + foldedRect.width / 2, crease); context.rotate(tiltDegrees * Math.PI / 180); context.translate(-(foldedRect.left + foldedRect.width / 2), -crease);
  context.shadowColor = 'rgba(76,53,38,.18)'; context.shadowBlur = 18; context.shadowOffsetY = 7;
  paintFoldedTop(context, foldedRect, options.patternId, options.paperAppearanceId, options.assets?.letterPaper, 1 - unfoldEased);
  context.shadowColor = 'transparent';
  if (unfoldEased > 0) {
    const lowerRect = { left: foldedRect.left, top: crease, width: foldedRect.width, height: halfHeight * unfoldEased };
    paintLetterPaperRegion(context, lowerRect, LETTER_PAPER_SOURCE_HEIGHT / 2, LETTER_PAPER_SOURCE_HEIGHT / 2, options.assets?.letterPaper, options.paperAppearanceId);
    const inset = Math.max(7, foldedRect.width * 0.035);
    const logicalFull = { left: foldedRect.left + inset, top: foldedRect.top + inset, width: foldedRect.width - inset * 2, height: halfHeight * 2 - inset * 2 };
    context.save(); context.beginPath(); context.rect(lowerRect.left, lowerRect.top, lowerRect.width, lowerRect.height); context.clip();
    context.translate(0, crease * (1 - unfoldEased)); context.scale(1, unfoldEased);
    paintPatternArt(context, logicalFull, patternById(options.patternId), false); context.restore();
  }
  context.restore();
}

function paintActivePostcard(context: CanvasRenderingContext2D, options: LetterScenePaintOptions): void {
  const { state, layout } = options;
  if (state.phase === 'draw' || state.phase === 'unfold') {
    paintFoldedLetter(context, options);
    return;
  }
  const rect = state.phase === 'burn' ? layout.burnCardRect : { ...layout.cardRect, top: layout.cardRect.top + state.offsetY };
  context.save(); context.translate(rect.left + rect.width / 2, rect.top + rect.height / 2); context.rotate(state.tiltDegrees * Math.PI / 180); context.translate(-(rect.left + rect.width / 2), -(rect.top + rect.height / 2));
  if (state.phase === 'burn' && state.elapsedMs >= 0) {
    updateBurnGeometryInto(options.burnGeometry, rect, burnProgress(state), options.burnSeed);
    paintBurningCard(context, rect, options.patternId, options.paperAppearanceId, options.burnGeometry, options.assets?.letterPaper);
  } else paintCardFace(context, rect, options.patternId, options.paperAppearanceId, state.phase !== 'front', state.text, options.prompt, options.assets?.letterPaper);
  context.restore();
}

export function paintLetterScene(context: CanvasRenderingContext2D, options: LetterScenePaintOptions): void {
  paintPaperBackground(context, options.width, options.height, options.assets?.background, options.assets?.backgroundComposed);
  const { state, layout } = options;
  const ritualClear = state.phase === 'fade' || state.phase === 'silence' || state.phase === 'stat';
  const openEnvelope = options.assets?.openEnvelope;
  if (openEnvelope) {
    if (state.phase === 'idle' || state.phase === 'draw' || state.phase === 'unfold') {
      paintEnvelopeAssetBack(context, layout.envelopeRect, openEnvelope, options.envelopeAppearanceId);
      if (state.phase === 'idle') paintFoldedTop(context, layout.foldedCardRect, options.patternId, options.paperAppearanceId, options.assets?.letterPaper);
      else paintActivePostcard(context, options);
      paintEnvelopeAssetFront(context, layout.envelopeRect, openEnvelope, options.envelopeAppearanceId);
    } else if (!ritualClear) {
      paintEnvelopeAssetBack(context, layout.envelopeRect, openEnvelope, options.envelopeAppearanceId);
      paintEnvelopeAssetFront(context, layout.envelopeRect, openEnvelope, options.envelopeAppearanceId);
      paintActivePostcard(context, options);
    }
  } else if (!ritualClear) paintActivePostcard(context, options);
  const glow = afterglowVisual(state);
  if (glow.alpha > 0) {
    const cx = layout.burnCardRect.left + layout.burnCardRect.width / 2; const cy = layout.burnCardRect.top + layout.burnCardRect.height;
    const radius = Math.max(options.width, options.height) * glow.radiusRatio; const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(216,90,48,${glow.alpha})`); gradient.addColorStop(1, 'rgba(216,90,48,0)'); context.fillStyle = gradient; context.fillRect(0, 0, options.width, options.height);
  }
  if (state.phase === 'stat' && state.count !== null) {
    const alpha = statAlpha(state); const x = options.width / 2; const y = layout.burnCardRect.top + layout.burnCardRect.height;
    context.save(); context.globalAlpha = alpha; context.fillStyle = INK; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = "18px ui-rounded,'PingFang SC',sans-serif"; context.fillText(COPY.now, x, y - 22);
    const number = String(state.count); const suffix = ` ${COPY.statSuffix}`;
    context.font = "29px ui-rounded,'PingFang SC',sans-serif"; const numberWidth = context.measureText(number).width; context.font = "18px ui-rounded,'PingFang SC',sans-serif"; const suffixWidth = context.measureText(suffix).width; const start = x - (numberWidth + suffixWidth) / 2;
    context.textAlign = 'left'; context.font = "29px ui-rounded,'PingFang SC',sans-serif"; context.fillText(number, start, y + 17); context.font = "18px ui-rounded,'PingFang SC',sans-serif"; context.fillText(suffix, start + numberWidth, y + 17); context.restore();
  }
  context.save();
  if (options.menuGlowProgress > 0) { context.shadowColor = 'rgba(255,249,232,.9)'; context.shadowBlur = 20 * (1 - options.menuGlowProgress); }
  context.strokeStyle = INK; context.globalAlpha = 0.72; context.lineWidth = 2; context.lineCap = 'round';
  const mx = layout.menuRect.left + layout.menuRect.width / 2; const my = layout.menuRect.top + layout.menuRect.height / 2;
  for (const offset of [-7, 0, 7]) { context.beginPath(); context.moveTo(mx - 11, my + offset); context.lineTo(mx + 11, my + offset); context.stroke(); }
  context.restore();
}

/** 清空手帐时复用同一连续火线；不产生单独粒子或网络效果。 */
export function paintPageBurn(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  geometry: BurnGeometryBuffer,
  seed: number,
): void {
  const rect = { left: 0, top: 0, width, height };
  updateBurnGeometryInto(geometry, rect, progress, seed);
  context.save(); context.fillStyle = 'rgba(73,55,47,.76)'; context.fillRect(0, 0, width, Math.max(0, height * progress - 7));
  context.beginPath(); context.moveTo(geometry.lineX[0], geometry.lineY[0]); for (let index = 1; index < geometry.lineX.length; index += 1) context.lineTo(geometry.lineX[index], geometry.lineY[index]);
  context.strokeStyle = '#49372F'; context.lineWidth = 10; context.stroke(); context.strokeStyle = OUTER_FLAME_COLOR; context.lineWidth = 7; context.stroke(); context.strokeStyle = INNER_FLAME_COLOR; context.lineWidth = 3; context.stroke(); context.restore();
}
