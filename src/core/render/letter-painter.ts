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

function roundedRect(context: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  context.beginPath();
  context.moveTo(rect.left + r, rect.top);
  context.lineTo(rect.left + rect.width - r, rect.top);
  context.quadraticCurveTo(rect.left + rect.width, rect.top, rect.left + rect.width, rect.top + r);
  context.lineTo(rect.left + rect.width, rect.top + rect.height - r);
  context.quadraticCurveTo(rect.left + rect.width, rect.top + rect.height, rect.left + rect.width - r, rect.top + rect.height);
  context.lineTo(rect.left + r, rect.top + rect.height);
  context.quadraticCurveTo(rect.left, rect.top + rect.height, rect.left, rect.top + rect.height - r);
  context.lineTo(rect.left, rect.top + r);
  context.quadraticCurveTo(rect.left, rect.top, rect.left + r, rect.top);
  context.closePath();
}

function mixHex(from: string, to: string, amount: number): string {
  const mixChannel = (offset: number) => Math.round(
    Number.parseInt(from.slice(offset, offset + 2), 16) * (1 - amount)
    + Number.parseInt(to.slice(offset, offset + 2), 16) * amount,
  ).toString(16).padStart(2, '0');
  return `#${mixChannel(1)}${mixChannel(3)}${mixChannel(5)}`;
}

function rgba(hex: string, alpha: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function materialSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function materialSample(seed: number, index: number, lane: number): number {
  const value = Math.sin(seed * 0.000013 + index * 19.191 + lane * 73.173) * 43758.5453123;
  return value - Math.floor(value);
}

function paintPaperTexture(
  context: CanvasRenderingContext2D,
  rect: Rect,
  detail: string,
  seed: number,
  density = 1,
): void {
  const wrinkleCount = Math.max(2, Math.round(7 * density));
  const fiberCount = Math.max(8, Math.round(22 * density));
  context.save();
  context.lineCap = 'round';
  for (let index = 0; index < wrinkleCount; index += 1) {
    const x = rect.left + materialSample(seed, index, 0) * rect.width;
    const y = rect.top + materialSample(seed, index, 1) * rect.height;
    const length = rect.width * (0.16 + materialSample(seed, index, 2) * 0.28);
    const angle = -0.9 + materialSample(seed, index, 3) * 1.8;
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    const bend = (materialSample(seed, index, 4) - 0.5) * rect.height * 0.11;
    context.beginPath(); context.moveTo(x, y); context.quadraticCurveTo((x + endX) / 2, (y + endY) / 2 + bend, endX, endY);
    context.strokeStyle = detail; context.globalAlpha = 0.055 + materialSample(seed, index, 5) * 0.035; context.lineWidth = 0.65; context.stroke();
    context.beginPath(); context.moveTo(x - 0.7, y - 0.8); context.quadraticCurveTo((x + endX) / 2 - 0.7, (y + endY) / 2 + bend - 0.8, endX - 0.7, endY - 0.8);
    context.strokeStyle = '#FFF9F0'; context.globalAlpha = 0.11; context.lineWidth = 0.45; context.stroke();
  }
  context.strokeStyle = detail; context.lineWidth = 0.38;
  for (let index = 0; index < fiberCount; index += 1) {
    const x = rect.left + materialSample(seed, index, 6) * rect.width;
    const y = rect.top + materialSample(seed, index, 7) * rect.height;
    const length = 2.5 + materialSample(seed, index, 8) * 7;
    const angle = materialSample(seed, index, 9) * Math.PI;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.globalAlpha = 0.065 + materialSample(seed, index, 10) * 0.045; context.stroke();
  }
  context.restore();
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
    return;
  }
  if (background) {
    paintCoverImage(context, background, width, height);
    return;
  }
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#F6EFE6'); gradient.addColorStop(0.58, '#F1E7DB'); gradient.addColorStop(1, '#E8D8C6');
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  context.save();
  for (let index = 0; index < 7; index += 1) {
    const x = materialSample(911, index, 0) * width;
    const y = materialSample(911, index, 1) * height;
    context.beginPath(); context.ellipse(x, y, width * (0.12 + materialSample(911, index, 2) * 0.13), height * 0.08, materialSample(911, index, 3) - 0.5, 0, Math.PI * 2);
    context.fillStyle = index % 2 === 0 ? '#FFF9F0' : '#C8B39D'; context.globalAlpha = index % 2 === 0 ? 0.025 : 0.015; context.fill();
  }
  paintPaperTexture(context, { left: 0, top: 0, width, height }, '#887460', 911, 0.7);
  context.restore();
}

export function paintPatternArt(context: CanvasRenderingContext2D, rect: Rect, pattern: PostcardPattern, paintBackground = true): void {
  const variation = ((pattern.seed % 11) - 5) / 5;
  const cx = rect.left + rect.width / 2 + variation * rect.width * 0.035;
  const cy = rect.top + rect.height / 2 - variation * rect.height * 0.025;
  context.fillStyle = pattern.background;
  if (paintBackground) context.fillRect(rect.left, rect.top, rect.width, rect.height);
  else { context.save(); context.globalAlpha = 0.24; context.fillRect(rect.left, rect.top, rect.width, rect.height); context.restore(); }
  context.strokeStyle = pattern.foreground; context.fillStyle = pattern.foreground; context.lineWidth = 2;
  switch (pattern.motif) {
    case 'sun':
      context.beginPath(); context.arc(cx, cy, rect.height * (0.17 + variation * 0.01), 0, Math.PI * 2); context.fill();
      context.globalAlpha = 0.45; context.beginPath(); context.arc(cx, cy, rect.height * (0.29 + variation * 0.015), 0, Math.PI * 2); context.stroke(); break;
    case 'hill':
      context.beginPath(); context.moveTo(rect.left, rect.top + rect.height * 0.72); context.quadraticCurveTo(cx * 0.9, rect.top + rect.height * 0.25, cx, rect.top + rect.height * 0.7); context.quadraticCurveTo(rect.left + rect.width * 0.78, rect.top + rect.height * 0.38, rect.left + rect.width, rect.top + rect.height * 0.75); context.lineTo(rect.left + rect.width, rect.top + rect.height); context.lineTo(rect.left, rect.top + rect.height); context.closePath(); context.fill(); break;
    case 'leaf':
      for (let index = 0; index < 5; index += 1) { const x = rect.left + rect.width * (0.2 + index * 0.15) + variation * index; const y = rect.top + rect.height * (0.7 - (index % 2) * 0.18) + variation * 3; context.beginPath(); context.ellipse(x, y, 13, 28, -0.55 + variation * 0.08, 0, Math.PI * 2); context.fill(); } break;
    case 'wave':
      for (let row = 0; row < 4; row += 1) { context.beginPath(); context.moveTo(rect.left + 18, rect.top + 45 + row * 28); context.bezierCurveTo(cx - 35, rect.top + 18 + row * 28, cx + 25, rect.top + 72 + row * 28, rect.left + rect.width - 18, rect.top + 43 + row * 28); context.stroke(); } break;
    case 'rain':
      for (let index = 0; index < 12; index += 1) { const x = rect.left + 25 + (index % 6) * (rect.width - 50) / 5; const y = rect.top + 35 + Math.floor(index / 6) * 70; context.beginPath(); context.moveTo(x, y); context.lineTo(x - 8, y + 20); context.stroke(); } break;
    case 'window':
      context.strokeRect(cx - 48, cy - 48, 96, 96); context.beginPath(); context.moveTo(cx, cy - 48); context.lineTo(cx, cy + 48); context.moveTo(cx - 48, cy); context.lineTo(cx + 48, cy); context.stroke(); break;
  }
  context.globalAlpha = 1; context.fillStyle = pattern.accent; context.fillRect(rect.left, rect.top + rect.height - 9, rect.width, 9);
}

// 信纸素材取样窗口：515×790 RGBA（背景已透明化），窗口为纸面内容包围盒 (13,15)-(503,747)
const LETTER_PAPER_SOURCE_LEFT = 13;
const LETTER_PAPER_SOURCE_TOP = 15;
const LETTER_PAPER_SOURCE_WIDTH = 491;
const LETTER_PAPER_SOURCE_HEIGHT = 733;

function paintLetterPaperTexture(
  context: CanvasRenderingContext2D,
  rect: Rect,
  image: CanvasImageSource,
  verticalAnchor: 'center' | 'top' = 'center',
): void {
  const targetRatio = rect.width / rect.height;
  const cropHeight = Math.min(LETTER_PAPER_SOURCE_HEIGHT, LETTER_PAPER_SOURCE_WIDTH / targetRatio);
  // 顶部锚定用于对折露出缘：信纸从信封抽出时先露出纸面上端
  const cropTop = verticalAnchor === 'top'
    ? LETTER_PAPER_SOURCE_TOP
    : LETTER_PAPER_SOURCE_TOP + (LETTER_PAPER_SOURCE_HEIGHT - cropHeight) / 2;
  context.drawImage(
    image,
    LETTER_PAPER_SOURCE_LEFT, cropTop, LETTER_PAPER_SOURCE_WIDTH, cropHeight,
    rect.left, rect.top, rect.width, rect.height,
  );
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
  const paper = APPEARANCES.find((item) => item.id === paperId) ?? APPEARANCES[4];
  context.save(); context.shadowColor = 'rgba(76,53,38,.18)'; context.shadowBlur = 18; context.shadowOffsetY = 7;
  roundedRect(context, rect, 3); context.fillStyle = paper.base; context.fill(); context.shadowColor = 'transparent'; context.clip();
  if (letterPaper) {
    paintLetterPaperTexture(context, rect, letterPaper);
    context.save(); context.globalAlpha = 0.08; context.fillStyle = paper.base; context.fillRect(rect.left, rect.top, rect.width, rect.height); context.restore();
  }
  else context.fillRect(rect.left, rect.top, rect.width, rect.height);
  if (!back) paintPatternArt(context, rect, patternById(patternId), !letterPaper);
  else {
    context.strokeStyle = paper.detail; context.lineWidth = 1;
    for (let y = rect.top + rect.height * 0.48; y < rect.top + rect.height - 25; y += 28) { context.beginPath(); context.moveTo(rect.left + 24, y); context.lineTo(rect.left + rect.width - 24, y); context.stroke(); }
    context.fillStyle = INK; context.textAlign = 'left'; context.textBaseline = 'top';
    context.globalAlpha = text ? 0.92 : 0.32; context.font = "15px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(text || prompt, rect.left + 25, rect.top + 32, rect.width - 50);
  }
  context.restore();
  context.save(); roundedRect(context, rect, 3); context.strokeStyle = 'rgba(91,72,58,.22)'; context.lineWidth = 1; context.stroke(); context.restore();
}

function paintCardEdge(context: CanvasRenderingContext2D, rect: Rect, paperId: string, letterPaper?: CanvasImageSource | null): void {
  const paper = APPEARANCES.find((item) => item.id === paperId) ?? APPEARANCES[4];
  context.save(); context.shadowColor = 'rgba(76,53,38,.12)'; context.shadowBlur = 10;
  roundedRect(context, rect, 3); context.fillStyle = paper.base; context.fill(); context.shadowColor = 'transparent'; context.clip();
  if (letterPaper) paintLetterPaperTexture(context, rect, letterPaper, 'top');
  context.strokeStyle = 'rgba(91,72,58,.2)'; context.lineWidth = 1; context.stroke(); context.restore();
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

function paintEnvelopeAssetBack(context: CanvasRenderingContext2D, rect: Rect, image: CanvasImageSource): void {
  const target = computeEnvelopeAssetRect(rect);
  context.save();
  context.shadowColor = 'rgba(77,55,39,.2)'; context.shadowBlur = 20; context.shadowOffsetY = 8;
  context.drawImage(image, target.left, target.top, target.width, target.height);
  context.restore();
}

function paintEnvelopeAssetFront(context: CanvasRenderingContext2D, rect: Rect, image: CanvasImageSource): void {
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
  context.drawImage(image, target.left, target.top, target.width, target.height);
  context.restore();
}

function paintEnvelopeBack(context: CanvasRenderingContext2D, rect: Rect, envelopeId: string): void {
  const appearance = APPEARANCES.find((item) => item.id === envelopeId) ?? APPEARANCES[0];
  const seed = materialSeed(appearance.id);
  const centerX = rect.left + rect.width / 2;
  const flapTop = rect.top - rect.height * 0.31;
  context.save(); context.shadowColor = 'rgba(77,55,39,.2)'; context.shadowBlur = 24; context.shadowOffsetY = 11;
  roundedRect(context, rect, 13); context.fillStyle = appearance.base; context.fill(); context.shadowColor = 'transparent';
  roundedRect(context, rect, 13); context.clip();
  const bodyGradient = context.createLinearGradient(rect.left, rect.top, rect.left + rect.width, rect.top + rect.height);
  bodyGradient.addColorStop(0, mixHex(appearance.base, '#FFF9F0', 0.3)); bodyGradient.addColorStop(0.48, appearance.base); bodyGradient.addColorStop(1, mixHex(appearance.base, appearance.detail, 0.3));
  context.fillStyle = bodyGradient; context.fillRect(rect.left, rect.top, rect.width, rect.height);
  paintPaperTexture(context, rect, appearance.detail, seed + 17, 0.82);
  context.restore();

  context.save();
  context.beginPath(); context.moveTo(rect.left + 10, rect.top + 18); context.lineTo(centerX, flapTop); context.lineTo(rect.left + rect.width - 10, rect.top + 18); context.closePath(); context.clip();
  const flapGradient = context.createLinearGradient(rect.left, flapTop, rect.left + rect.width, rect.top + 18);
  flapGradient.addColorStop(0, mixHex(appearance.base, '#FFF9F0', 0.38)); flapGradient.addColorStop(0.52, appearance.base); flapGradient.addColorStop(1, mixHex(appearance.base, appearance.detail, 0.2));
  context.fillStyle = flapGradient; context.fillRect(rect.left, flapTop, rect.width, rect.top + 18 - flapTop);
  paintPaperTexture(context, { left: rect.left, top: flapTop, width: rect.width, height: rect.top + 18 - flapTop }, appearance.detail, seed + 43, 0.56);
  context.restore();

  context.save();
  context.beginPath(); context.moveTo(rect.left + 19, rect.top + 17); context.lineTo(centerX, flapTop + rect.height * 0.09); context.lineTo(rect.left + rect.width - 19, rect.top + 17); context.closePath();
  const linerGradient = context.createLinearGradient(rect.left, flapTop, rect.left + rect.width, rect.top + 22);
  linerGradient.addColorStop(0, mixHex(appearance.base, '#FFF9F0', 0.5)); linerGradient.addColorStop(1, mixHex(appearance.base, appearance.detail, 0.08));
  context.fillStyle = linerGradient; context.globalAlpha = 0.78; context.fill();
  context.strokeStyle = rgba(appearance.detail, 0.24); context.lineWidth = 0.8; context.stroke();
  context.restore();
}

function addEnvelopeFrontPath(context: CanvasRenderingContext2D, rect: Rect): void {
  const centerX = rect.left + rect.width / 2;
  const foldY = rect.top + rect.height * 0.59;
  context.moveTo(rect.left + 2, rect.top + 15); context.lineTo(centerX, foldY); context.lineTo(rect.left + 2, rect.top + rect.height - 2); context.closePath();
  context.moveTo(rect.left + rect.width - 2, rect.top + 15); context.lineTo(centerX, foldY); context.lineTo(rect.left + rect.width - 2, rect.top + rect.height - 2); context.closePath();
  context.moveTo(rect.left + 2, rect.top + rect.height - 2); context.lineTo(centerX, foldY); context.lineTo(rect.left + rect.width - 2, rect.top + rect.height - 2); context.closePath();
}

function paintFoldCrease(context: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, detail: string): void {
  context.beginPath(); context.moveTo(fromX, fromY); context.lineTo(toX, toY);
  context.strokeStyle = rgba(detail, 0.32); context.globalAlpha = 1; context.lineWidth = 0.85; context.stroke();
  context.beginPath(); context.moveTo(fromX, fromY - 0.75); context.lineTo(toX, toY - 0.75);
  context.strokeStyle = 'rgba(255,249,240,.34)'; context.lineWidth = 0.65; context.stroke();
}

function paintEnvelopeFront(context: CanvasRenderingContext2D, rect: Rect, envelopeId: string): void {
  const appearance = APPEARANCES.find((item) => item.id === envelopeId) ?? APPEARANCES[0];
  const seed = materialSeed(appearance.id);
  const centerX = rect.left + rect.width / 2;
  const foldY = rect.top + rect.height * 0.59;
  context.save(); roundedRect(context, rect, 13); context.clip();

  const leftGradient = context.createLinearGradient(rect.left, rect.top, centerX, rect.top + rect.height);
  leftGradient.addColorStop(0, mixHex(appearance.base, '#FFF9F0', 0.22)); leftGradient.addColorStop(0.58, appearance.base); leftGradient.addColorStop(1, mixHex(appearance.base, appearance.detail, 0.2));
  context.beginPath(); context.moveTo(rect.left + 2, rect.top + 15); context.lineTo(centerX, foldY); context.lineTo(rect.left + 2, rect.top + rect.height - 2); context.closePath(); context.fillStyle = leftGradient; context.fill();

  const rightGradient = context.createLinearGradient(rect.left + rect.width, rect.top, centerX, rect.top + rect.height);
  rightGradient.addColorStop(0, mixHex(appearance.base, '#FFF9F0', 0.12)); rightGradient.addColorStop(0.52, appearance.base); rightGradient.addColorStop(1, mixHex(appearance.base, appearance.detail, 0.28));
  context.beginPath(); context.moveTo(rect.left + rect.width - 2, rect.top + 15); context.lineTo(centerX, foldY); context.lineTo(rect.left + rect.width - 2, rect.top + rect.height - 2); context.closePath(); context.fillStyle = rightGradient; context.fill();

  const pocketGradient = context.createLinearGradient(rect.left, foldY, rect.left + rect.width, rect.top + rect.height);
  pocketGradient.addColorStop(0, mixHex(appearance.base, '#FFF9F0', 0.26)); pocketGradient.addColorStop(0.5, appearance.base); pocketGradient.addColorStop(1, mixHex(appearance.base, appearance.detail, 0.24));
  context.beginPath(); context.moveTo(rect.left + 2, rect.top + rect.height - 2); context.lineTo(centerX, foldY); context.lineTo(rect.left + rect.width - 2, rect.top + rect.height - 2); context.closePath(); context.fillStyle = pocketGradient; context.fill();

  context.save(); context.beginPath(); addEnvelopeFrontPath(context, rect); context.clip();
  paintPaperTexture(context, rect, appearance.detail, seed + 89, 1);
  context.restore();

  paintFoldCrease(context, rect.left + 3, rect.top + 16, centerX, foldY, appearance.detail);
  paintFoldCrease(context, rect.left + rect.width - 3, rect.top + 16, centerX, foldY, appearance.detail);
  paintFoldCrease(context, rect.left + 3, rect.top + rect.height - 3, centerX, foldY, appearance.detail);
  paintFoldCrease(context, rect.left + rect.width - 3, rect.top + rect.height - 3, centerX, foldY, appearance.detail);
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

/**
 * 抽取与自动展开阶段的对折信纸：完整信纸只在折线以上可见，下半页随展开进度向下展开。
 * draw 相位跟随手指（progress 0）；unfold 相位以释放位移为起点插值上缘并展开下半页，折痕随之淡出。
 */
function paintFoldedLetter(context: CanvasRenderingContext2D, options: LetterScenePaintOptions): void {
  const { state, layout } = options;
  const card = layout.cardRect;
  const halfHeight = card.height / 2;
  const startTop = layout.exposedCardRect.top + state.offsetY;
  const progress = state.phase === 'unfold'
    ? Math.max(0, Math.min(1, state.elapsedMs / UNFOLD_DURATION_MS))
    : 0;
  const eased = 1 - Math.pow(1 - progress, 3);
  const top = startTop + (card.top - startTop) * eased;
  const crease = top + halfHeight;
  const visibleBottom = crease + halfHeight * eased;
  const tiltDegrees = state.tiltDegrees * (1 - eased);
  context.save();
  context.translate(card.left + card.width / 2, top + halfHeight); context.rotate(tiltDegrees * Math.PI / 180); context.translate(-(card.left + card.width / 2), -(top + halfHeight));
  context.beginPath(); context.rect(card.left - 2, top - 2, card.width + 4, visibleBottom - top + 4); context.clip();
  paintCardFace(context, card, options.patternId, options.paperAppearanceId, false, state.text, options.prompt, options.assets?.letterPaper);
  if (eased < 1) {
    // 折痕：折线上侧投影渐变 + 深色折线，随展开进度淡出
    const foldAlpha = 1 - eased;
    const foldGradient = context.createLinearGradient(0, crease - 22, 0, crease);
    foldGradient.addColorStop(0, 'rgba(73,55,47,0)');
    foldGradient.addColorStop(1, `rgba(73,55,47,${0.18 * foldAlpha})`);
    context.fillStyle = foldGradient; context.fillRect(card.left, crease - 22, card.width, 22);
    context.fillStyle = `rgba(73,55,47,${0.26 * foldAlpha})`; context.fillRect(card.left, crease - 1, card.width, 1.5);
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
    if (state.phase === 'idle') {
      paintEnvelopeAssetBack(context, layout.envelopeRect, openEnvelope);
      paintCardEdge(context, layout.exposedCardRect, options.paperAppearanceId, options.assets?.letterPaper);
      paintEnvelopeAssetFront(context, layout.envelopeRect, openEnvelope);
    } else if (state.phase === 'draw') {
      paintEnvelopeAssetBack(context, layout.envelopeRect, openEnvelope);
      paintActivePostcard(context, options);
      paintEnvelopeAssetFront(context, layout.envelopeRect, openEnvelope);
    } else if (!ritualClear) {
      paintEnvelopeAssetBack(context, layout.envelopeRect, openEnvelope);
      paintEnvelopeAssetFront(context, layout.envelopeRect, openEnvelope);
      paintActivePostcard(context, options);
    }
  } else if (state.phase === 'idle') {
    paintEnvelopeBack(context, layout.envelopeRect, options.envelopeAppearanceId);
    paintCardEdge(context, layout.exposedCardRect, options.paperAppearanceId);
    paintEnvelopeFront(context, layout.envelopeRect, options.envelopeAppearanceId);
  } else if (state.phase === 'draw') {
    paintEnvelopeBack(context, layout.envelopeRect, options.envelopeAppearanceId);
    paintActivePostcard(context, options);
    paintEnvelopeFront(context, layout.envelopeRect, options.envelopeAppearanceId);
  } else if (!ritualClear) {
    paintEnvelopeBack(context, layout.envelopeRect, options.envelopeAppearanceId);
    paintEnvelopeFront(context, layout.envelopeRect, options.envelopeAppearanceId);
    paintActivePostcard(context, options);
  }
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
