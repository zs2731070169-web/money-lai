import { COPY } from '../content/copy';
import type { LetterState } from '../letter/letter-state';
import { EDIT_ENTER_DURATION_MS, EDIT_RETURN_DURATION_MS, REDUCED_EDIT_ENTER_DURATION_MS, REDUCED_EDIT_RETURN_DURATION_MS, REDUCED_SETTLE_DURATION_MS, REDUCED_UNFOLD_DURATION_MS, SETTLE_DURATION_MS, UNFOLD_DURATION_MS, statAlpha } from '../letter/letter-state';
import { ENVELOPE_ASSET_ANCHORS, type LetterSceneLayout, type Rect } from './letter-layout';
import { BACKGROUND_SOURCE_HEIGHT as BACKGROUND_PIXEL_HEIGHT, BACKGROUND_SOURCE_WIDTH as BACKGROUND_PIXEL_WIDTH } from './background-composition';
import { DEFAULT_FONT_PACKAGE_ID, fontStackForPackage, type FontPackageId } from './letter-font';

const INK = '#354940';
export interface LetterSceneAssets {
  background?: CanvasImageSource | null;
  /** 竖屏下按视口离屏合成的背景（视口比例、整幅拉伸绘制），优先于 background。 */
  backgroundComposed?: CanvasImageSource | null;
  closedEnvelope?: CanvasImageSource | null;
  /** 兼容旧调用方的扁平图；生产主循环使用下面两张独立层。 */
  openEnvelope?: CanvasImageSource | null;
  openEnvelopeBack?: CanvasImageSource | null;
  openEnvelopeFront?: CanvasImageSource | null;
  letterPaper?: CanvasImageSource | null;
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
const BACKGROUND_LIGHTEN_WASH_ALPHA = 0.2;

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

// topic1 信纸画布为 1024×1536，但纸面实际包围盒约为 (56,51)-(972,1460)。
// 只取纸面内容，避免透明边距把信纸视觉上缩窄；上下半页仍从同一张原图连续取样。
const LETTER_PAPER_SOURCE_LEFT = 56;
const LETTER_PAPER_SOURCE_TOP = 51;
const LETTER_PAPER_SOURCE_WIDTH = 917;
const LETTER_PAPER_SOURCE_HEIGHT = 1409;

function paintLetterPaperRegion(
  context: CanvasRenderingContext2D,
  rect: Rect,
  sourceTop: number,
  sourceHeight: number,
  image?: CanvasImageSource | null,
): void {
  if (!image) return;
  context.drawImage(
    image,
    LETTER_PAPER_SOURCE_LEFT, LETTER_PAPER_SOURCE_TOP + sourceTop, LETTER_PAPER_SOURCE_WIDTH, sourceHeight,
    rect.left, rect.top, rect.width, rect.height,
  );
}

export function paintLetterPaperAsset(
  context: CanvasRenderingContext2D,
  rect: Rect,
  image?: CanvasImageSource | null,
): void {
  paintLetterPaperRegion(context, rect, 0, LETTER_PAPER_SOURCE_HEIGHT, image);
}

function wrapTextLines(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string[] {
  const lines: string[] = [];
  let currentLine = '';
  const pushCurrentLine = (force = false): void => {
    if (!currentLine && !force) return;
    lines.push(currentLine.trimEnd());
    currentLine = '';
  };
  const appendByCharacter = (token: string): void => {
    for (const character of Array.from(token)) {
      const candidate = currentLine + character;
      if (currentLine && context.measureText(candidate).width > maximumWidth) pushCurrentLine();
      currentLine += character;
    }
  };
  const paragraphs = text.split(/\r?\n/);
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph) {
      pushCurrentLine(true);
      return;
    }
    const tokens = paragraph.match(/[\u3400-\u9FFF\uF900-\uFAFF]|[^\s\u3400-\u9FFF\uF900-\uFAFF]+|\s+/g) ?? Array.from(paragraph);
    for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (currentLine) currentLine += token;
      continue;
    }
    if (context.measureText(currentLine + token).width <= maximumWidth) {
      currentLine += token;
      continue;
    }
    pushCurrentLine();
    if (context.measureText(token).width <= maximumWidth) currentLine = token;
    else appendByCharacter(token);
    }
    if (paragraphIndex < paragraphs.length - 1) pushCurrentLine(true);
  });
  pushCurrentLine();
  if (lines.length === 0) lines.push('');
  return lines;
}

/**
 * 文字直接落在原始信纸的中央留白区；不另造“背面”、横线或输入框。
 * 长句从偏松的手写字号逐级收敛，优先完整呈现用户原文。
 */
export function paintPaperWriting(
  context: CanvasRenderingContext2D,
  rect: Rect,
  text: string,
  fontPackageId: FontPackageId = DEFAULT_FONT_PACKAGE_ID,
): void {
  // 空文字保持纸面留白：引导语只出现在放大编辑的输入层，不再印到缩小后的信纸上
  if (!text) return;
  const writingLeft = rect.left + rect.width * 0.16;
  const writingTop = rect.top + rect.height * 0.14;
  const writingWidth = rect.width * 0.68;
  const writingHeight = rect.height * 0.72;
  // 字号随纸宽自适应：优先 13px 上限，长文逐级收缩到 9-10px 下限保证整封可读
  const preferredFontSize = Math.max(8, Math.min(13, rect.width * 0.048));
  const minimumFontSize = Math.max(9, Math.min(10, rect.width * 0.03));
  const lineHeightScale = 1.48;
  let fontSize = preferredFontSize;
  let lineHeight = fontSize * lineHeightScale;
  let lines: string[] = [];

  for (let candidateSize = preferredFontSize; candidateSize >= minimumFontSize; candidateSize -= 1) {
    context.font = `${candidateSize}px ${fontStackForPackage(fontPackageId)}`;
    const candidateLines = wrapTextLines(context, text, writingWidth);
    const candidateLineHeight = candidateSize * lineHeightScale;
    fontSize = candidateSize;
    lineHeight = candidateLineHeight;
    lines = candidateLines;
    if (candidateLines.length * candidateLineHeight <= writingHeight) break;
  }

  context.fillStyle = INK;
  context.globalCompositeOperation = 'multiply';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.globalAlpha = text ? 0.94 : 0.52;
  context.font = `${fontSize}px ${fontStackForPackage(fontPackageId)}`;
  context.beginPath();
  context.rect(writingLeft, writingTop, writingWidth, writingHeight);
  context.clip();
  for (let index = 0; index < lines.length; index += 1) {
    context.fillText(lines[index], writingLeft, writingTop + index * lineHeight, writingWidth);
  }
}

function paintCardFace(
  context: CanvasRenderingContext2D,
  rect: Rect,
  showWriting: boolean,
  text: string,
  fontPackageId: FontPackageId,
  letterPaper?: CanvasImageSource | null,
): void {
  context.save();
  context.shadowColor = 'rgba(76,53,38,.18)'; context.shadowBlur = 18; context.shadowOffsetY = 7;
  paintLetterPaperAsset(context, rect, letterPaper);
  context.shadowColor = 'transparent';
  if (showWriting) paintPaperWriting(context, rect, text, fontPackageId);
  context.restore();
}

export function computeEnvelopeAssetRect(rect: Rect): Rect {
  const size = rect.width / (ENVELOPE_ASSET_ANCHORS.right - ENVELOPE_ASSET_ANCHORS.left);
  return {
    left: rect.left + rect.width / 2 - size / 2,
    top: rect.top + rect.height - ENVELOPE_ASSET_ANCHORS.bottom * size,
    width: size,
    height: size,
  };
}

function paintEnvelopeAssetLayer(
  context: CanvasRenderingContext2D,
  rect: Rect,
  image: CanvasImageSource,
  shadow = false,
  opacity = 1,
): void {
  const target = computeEnvelopeAssetRect(rect);
  context.save();
  context.globalAlpha = opacity;
  if (shadow) {
    context.shadowColor = 'rgba(77,55,39,.2)'; context.shadowBlur = 20; context.shadowOffsetY = 8;
  }
  context.drawImage(image, target.left, target.top, target.width, target.height);
  context.restore();
}

export interface LetterScenePaintOptions {
  width: number; height: number; layout: LetterSceneLayout; state: LetterState;
  menuGlowProgress: number;
  fontPackageId?: FontPackageId;
  reducedMotion?: boolean;
  assets?: LetterSceneAssets;
}

function paintFoldedTop(
  context: CanvasRenderingContext2D,
  foldedRect: Rect,
  letterPaper?: CanvasImageSource | null,
  creaseAlpha = 1,
): void {
  paintLetterPaperRegion(context, foldedRect, 0, LETTER_PAPER_SOURCE_HEIGHT / 2, letterPaper);
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
  const unfoldDurationMs = options.reducedMotion ? REDUCED_UNFOLD_DURATION_MS : UNFOLD_DURATION_MS;
  const progress = state.phase === 'unfold'
    ? Math.max(0, Math.min(1, state.elapsedMs / unfoldDurationMs))
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
  // 信纸不可能穿出信封底边以下：“放回/下压”的快速位移会让倾角一帧内到 8°，
  // 绕折线回转的纸角会荡出信封底线约 19px 穿帮到桌面。裁剪到底线内侧 1px，
  // 裁切痕迹仍被不透明前袋覆盖；投影同样不再漏出底边。
  context.beginPath();
  context.rect(-1, 0, options.width + 2, layout.envelopeRect.top + layout.envelopeRect.height - 1);
  context.clip();
  context.translate(foldedRect.left + foldedRect.width / 2, crease); context.rotate(tiltDegrees * Math.PI / 180); context.translate(-(foldedRect.left + foldedRect.width / 2), -crease);
  context.shadowColor = 'rgba(76,53,38,.18)'; context.shadowBlur = 18; context.shadowOffsetY = 7;
  paintFoldedTop(context, foldedRect, options.assets?.letterPaper, 1 - unfoldEased);
  context.shadowColor = 'transparent';
  if (unfoldEased > 0) {
    const lowerRect = { left: foldedRect.left, top: crease, width: foldedRect.width, height: halfHeight * unfoldEased };
    paintLetterPaperRegion(context, lowerRect, LETTER_PAPER_SOURCE_HEIGHT / 2, LETTER_PAPER_SOURCE_HEIGHT / 2, options.assets?.letterPaper);
  }
  context.restore();
}

const LETTER_PAPER_ASPECT_RATIO = LETTER_PAPER_SOURCE_WIDTH / LETTER_PAPER_SOURCE_HEIGHT;

/** 在安全区内以原纸比例计算编辑态的大信纸，不改变素材本身的裁切方式。 */
export function computeExpandedPaperRect(layout: LetterSceneLayout): Rect {
  const maximumWidth = layout.safeContentRect.width;
  const maximumHeight = layout.safeContentRect.height;
  let width = maximumWidth;
  let height = width / LETTER_PAPER_ASPECT_RATIO;
  if (height > maximumHeight) {
    height = maximumHeight;
    width = height * LETTER_PAPER_ASPECT_RATIO;
  }
  return {
    left: layout.safeContentRect.left + (layout.safeContentRect.width - width) / 2,
    top: layout.safeContentRect.top + (layout.safeContentRect.height - height) / 2,
    width,
    height,
  };
}

function interpolateRect(from: Rect, to: Rect, progress: number): Rect {
  const ratio = Math.max(0, Math.min(1, progress));
  return {
    left: from.left + (to.left - from.left) * ratio,
    top: from.top + (to.top - from.top) * ratio,
    width: from.width + (to.width - from.width) * ratio,
    height: from.height + (to.height - from.height) * ratio,
  };
}

/**
 * 回缩时先让信纸回到卡片附近，再显现信封前袋（前袋不抢盖回收动画开头）。
 * 收好折回入袋时前袋随进度渐进遮回；入袋后的安静/统计阶段保持完全遮盖。
 */
function editReturnFrontAlpha(state: LetterState, reducedMotion = false): number {
  if (state.phase === 'settle') {
    // 前袋在后半程渐进遮回：先看清信纸折入，临近入袋时前袋合拢
    const durationMs = reducedMotion ? REDUCED_SETTLE_DURATION_MS : SETTLE_DURATION_MS;
    const progress = Math.max(0, Math.min(1, state.elapsedMs / durationMs));
    if (progress <= 0.5) return 0;
    const revealProgress = Math.min(1, (progress - 0.5) / 0.45);
    return 1 - Math.pow(1 - revealProgress, 3);
  }
  if (state.phase !== 'edit-return') return 1;
  const durationMs = reducedMotion ? REDUCED_EDIT_RETURN_DURATION_MS : EDIT_RETURN_DURATION_MS;
  const progress = Math.max(0, Math.min(1, state.elapsedMs / durationMs));
  const revealStart = 0.76;
  const revealEnd = 0.9;
  if (progress <= revealStart) return 0;
  const revealProgress = Math.min(1, (progress - revealStart) / (revealEnd - revealStart));
  return 1 - Math.pow(1 - revealProgress, 3);
}

function paintActivePostcard(context: CanvasRenderingContext2D, options: LetterScenePaintOptions): void {
  const { state, layout } = options;
  if (state.phase === 'draw' || state.phase === 'unfold') {
    paintFoldedLetter(context, options);
    return;
  }
  let rect: Rect;
  if (state.phase === 'edit') {
    const durationMs = options.reducedMotion ? REDUCED_EDIT_ENTER_DURATION_MS : EDIT_ENTER_DURATION_MS;
    const progress = Math.min(1, state.elapsedMs / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    rect = interpolateRect(layout.cardRect, computeExpandedPaperRect(layout), eased);
  } else if (state.phase === 'edit-return') {
    const durationMs = options.reducedMotion ? REDUCED_EDIT_RETURN_DURATION_MS : EDIT_RETURN_DURATION_MS;
    const progress = 1 - Math.min(1, state.elapsedMs / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    rect = interpolateRect(layout.cardRect, computeExpandedPaperRect(layout), eased);
  } else if (state.phase === 'settle') {
    // 确认收好：整张信纸从展示位连续折回成对折态插回信封，前袋同步遮回
    const durationMs = options.reducedMotion ? REDUCED_SETTLE_DURATION_MS : SETTLE_DURATION_MS;
    const progress = Math.min(1, state.elapsedMs / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    rect = interpolateRect(layout.cardRect, layout.foldedCardRect, eased);
  } else {
    rect = { ...layout.cardRect, top: layout.cardRect.top + state.offsetY };
  }
  context.save(); context.translate(rect.left + rect.width / 2, rect.top + rect.height / 2); context.rotate(state.tiltDegrees * Math.PI / 180); context.translate(-(rect.left + rect.width / 2), -(rect.top + rect.height / 2));
  paintCardFace(context, rect, true, state.text, options.fontPackageId ?? DEFAULT_FONT_PACKAGE_ID, options.assets?.letterPaper);
  context.restore();
}

export function paintLetterScene(context: CanvasRenderingContext2D, options: LetterScenePaintOptions): void {
  paintPaperBackground(context, options.width, options.height, options.assets?.background, options.assets?.backgroundComposed);
  const { state, layout } = options;
  // 入袋后的安静/统计阶段按「纸已收好」呈现：信封静置 + 对折纸就位
  const tucked = state.phase === 'idle' || state.phase === 'quiet' || state.phase === 'stat';
  const openEnvelopeBack = options.assets?.openEnvelopeBack;
  const openEnvelopeFront = options.assets?.openEnvelopeFront;
  const legacyOpenEnvelope = options.assets?.openEnvelope;
  const envelopeFrontAlpha = editReturnFrontAlpha(state, options.reducedMotion);
  if (state.phase === 'edit') {
    // 编辑态让原始信纸独占可用视口，避免信封层把放大后的纸面截断。
    paintActivePostcard(context, options);
  } else if (openEnvelopeBack && openEnvelopeFront) {
    // 真实遮挡顺序：后片/内衬 → 信纸 → V 字正面。正面层不再依赖近似裁剪。
    paintEnvelopeAssetLayer(context, layout.envelopeRect, openEnvelopeBack, true);
    if (tucked) paintFoldedTop(context, layout.foldedCardRect, options.assets?.letterPaper);
    else paintActivePostcard(context, options);
    if (envelopeFrontAlpha > 0) {
      paintEnvelopeAssetLayer(context, layout.envelopeRect, openEnvelopeFront, false, envelopeFrontAlpha);
    }
  } else if (legacyOpenEnvelope) {
    // 仅为旧快照/菜单测试保留；发行入口不会走这条路径。
    paintEnvelopeAssetLayer(context, layout.envelopeRect, legacyOpenEnvelope, true);
    if (tucked) paintFoldedTop(context, layout.foldedCardRect, options.assets?.letterPaper);
    else paintActivePostcard(context, options);
    if (envelopeFrontAlpha > 0) {
      paintEnvelopeAssetLayer(context, layout.envelopeRect, legacyOpenEnvelope, false, envelopeFrontAlpha);
    }
  } else paintActivePostcard(context, options);
  if (state.phase === 'stat' && state.count !== null) {
    const alpha = statAlpha(state); const x = options.width / 2; const y = layout.envelopeRect.top - 24;
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

/** 清空手帐的克制纸面渐隐：整页随进度沉入暖纸底色，无火焰与粒子。 */
export function paintPageFade(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
): void {
  const ratio = Math.max(0, Math.min(1, progress));
  if (ratio <= 0) return;
  context.save(); context.fillStyle = `rgba(247,239,228,${ratio})`; context.fillRect(0, 0, width, height); context.restore();
}
