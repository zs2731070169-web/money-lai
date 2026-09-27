import { Rect } from '../wallet/flap-hit-test';
import { OffscreenCanvasSurface } from '../platform';
import type { WalletLeatherPalette } from './skin-palettes';
import { cssColorWithAlpha } from '../utility/color-utilities';
import { buildRoundedRectPath } from './canvas-shapes';
import { paintLaiBanknote } from './bill-painter';
import {
  BILL_STACK_LAYER_COUNT,
  BILL_STACK_LAYER_STRIDE_PIXELS,
  billRectAtDrawRatio,
} from './bill-geometry';
import {
  FLAP_STRIP_COUNT,
  flapFaceVisibilityForSpread,
  flapFaceTransitionClipRect,
  flapLeatherEdgeRect,
  flapProjectedSpreadRatio,
  isFlapBackFaceVisible,
  projectFlapPointAtParameter,
} from './flap-projection';
import {
  FLAP_BACK_CORNER_RADIUS_PIXELS,
  FLAP_FRONT_CORNER_RADIUS_PIXELS,
  ProjectedFlapBoundary,
  createProjectedFlapShapeBuffers,
  projectRoundedFlapShapeInto,
} from './flap-rounded-outline';

/**
 * 钱包静物画师（顶边铰链版，game-visuals 规格 v2.3）。
 *
 * 翻盖绕钱包顶边铰链沿弧线翻转：正/背面面部纹理离屏预渲染，
 * 每帧按 FLAP_STRIP_COUNT 条水平条带做俯角透视投影绘制（梯形畸变 + 自由边弧线 + 180° 直立完整矩形）；
 * 侧对视线时以 8% 皮革切边平滑交接（永不成线）；内衬与纸币堆随翻开露出。
 * 无离屏画布时降级为平面渲染。
 */

/**
 * 钱包内纸币堆（实测反馈：钱本身在钱包里，开盖即见——遮挡揭示，非淡入浮现）。
 * 六张真票面微旋转错位叠放，整体裁剪到钱包内部区域（铰链→折线），
 * 恒不透明；闭合时被上层翻盖条带完全遮挡，掀开边缘升到哪里露出哪里。
 */
const BILL_STACK_DENOMINATION_IDS = ['denomination-100', 'denomination-10', 'denomination-5'];

/** 条带投影的跨帧共享缓冲（flap-shape-buffer-reuse）：单画布单线程，每帧恰好一次填充-消费 */
const sharedFlapShapeBuffers = createProjectedFlapShapeBuffers();

/** 面部纹理缓存（由 Game 持有并按尺寸重建） */
export interface FlapFaceSurfaces {
  front: OffscreenCanvasSurface;
  back: OffscreenCanvasSurface;
}

export interface WalletPaintOptions {
  walletRect: Rect;
  /** 折线（钱包口/纸币露出处），也定义翻盖长度：铰链（顶边）到折线 */
  foldLineY: number;
  /** 翻盖折叠角（度，0=贴前面闭合，180=顶边直立；渲染前由调用方完成自适应重映射） */
  flapRotationDegrees: number;
  /** 呼吸微动效缩放（1 ± ≤0.005；reduced motion 时恒为 1） */
  breathingScale: number;
  /** 面部纹理缓存（null → 平面降级渲染） */
  flapFaceSurfaces: FlapFaceSurfaces | null;
  /** 钱包皮革色板（wire-skin-palettes）：classic 传入时与设计令牌一致 */
  walletLeatherPalette: WalletLeatherPalette;
  /** 当前皮肤 id：钱包内纸币堆的纸纹染色 */
  activeSkinId?: string;
  /** v4 物理连续：抓取期间隐藏堆顶张（由 activeBill 渲染同一张） */
  hideTopStackLayer?: boolean;
  /** 下一张将被抽出的确定性面额 */
  topBillDenominationId?: string;
  /** 当前张抽离后露出的下一张面额 */
  followingBillDenominationId?: string;
}

export function paintWalletScene(
  renderingContext: CanvasRenderingContext2D,
  options: WalletPaintOptions,
): void {
  const { walletRect, foldLineY, flapRotationDegrees, breathingScale } = options;
  const leatherColors = options.walletLeatherPalette;
  const walletCenterX = walletRect.left + walletRect.width / 2;
  const hingeY = walletRect.top;
  const flapLengthPixels = foldLineY - walletRect.top;

  renderingContext.save();
  // 呼吸微动效：围绕钱包中心极小幅缩放
  renderingContext.translate(walletCenterX, walletRect.top + walletRect.height / 2);
  renderingContext.scale(breathingScale, breathingScale);
  renderingContext.translate(-walletCenterX, -(walletRect.top + walletRect.height / 2));

  const backFaceVisible = isFlapBackFaceVisible(
    flapRotationDegrees,
    flapLengthPixels,
    walletRect.width,
  );
  const faceVisibility = flapFaceVisibilityForSpread(
    flapProjectedSpreadRatio(flapRotationDegrees, flapLengthPixels, walletRect.width),
  );

  // 背面朝观众（翻盖已越过顶边）：先画条带，被钱包体自然遮挡铰链附近的窄条
  if (backFaceVisible && faceVisibility > 0) {
    renderingContext.save();
    renderingContext.globalAlpha *= faceVisibility;
    clipProjectedFaceWidth(renderingContext, options, faceVisibility);
    paintFlapWithStrips(renderingContext, options, 'back');
    renderingContext.restore();
  }

  // 主体：柔和投影（光源左上 → 阴影向右下）+ 皮革色
  renderingContext.save();
  renderingContext.shadowColor = cssColorWithAlpha(leatherColors.shadowColorHex, 0.2);
  renderingContext.shadowBlur = 26;
  renderingContext.shadowOffsetX = 9;
  renderingContext.shadowOffsetY = 13;
  buildRoundedRectPath(renderingContext, walletRect, 18);
  renderingContext.fillStyle = leatherColors.bodyColorHex;
  renderingContext.fill();
  renderingContext.restore();

  // 体积感：右下方向的暗面渐变（左上受光）
  const bodyShadingGradient = renderingContext.createLinearGradient(
    walletRect.left,
    walletRect.top,
    walletRect.left + walletRect.width,
    walletRect.top + walletRect.height,
  );
  bodyShadingGradient.addColorStop(0, 'rgba(255, 248, 238, 0.16)');
  bodyShadingGradient.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  bodyShadingGradient.addColorStop(1, 'rgba(61, 44, 32, 0.14)');
  buildRoundedRectPath(renderingContext, walletRect, 18);
  renderingContext.fillStyle = bodyShadingGradient;
  renderingContext.fill();

  // 主体缝线：内缩虚线框
  paintStitchingFrame(renderingContext, {
    left: walletRect.left + 8,
    top: hingeY + 8,
    width: walletRect.width - 16,
    height: walletRect.height - 16,
  }, leatherColors);

  // 内衬面板（翻盖区域内部）：翻盖抬起后露出的钱包内里（纸币堆画其上）
  buildRoundedRectPath(renderingContext, {
    left: walletRect.left + 5,
    top: hingeY + 3,
    width: walletRect.width - 10,
    height: flapLengthPixels - 4,
  }, 12);
  renderingContext.fillStyle = leatherColors.liningColorHex;
  renderingContext.fill();

  // 钱包口（折线）接缝：内里与下半部的分界
  renderingContext.save();
  renderingContext.strokeStyle = leatherColors.deepColorHex;
  renderingContext.globalAlpha = 0.4;
  renderingContext.lineWidth = 2;
  renderingContext.beginPath();
  renderingContext.moveTo(walletRect.left + 2, foldLineY);
  renderingContext.lineTo(walletRect.left + walletRect.width - 2, foldLineY);
  renderingContext.stroke();
  renderingContext.restore();

  // 钱包内纸币堆：恒不透明，纯靠闭合翻盖遮挡（遮挡揭示语义）。
  // v4 物理连续：抓取期间堆顶张由 activeBill 渲染（它就是被拖的那张），堆叠隐藏顶张。
  paintBillStackPeek(renderingContext, walletRect, foldLineY,
    options.hideTopStackLayer === true, options.topBillDenominationId ?? 'denomination-1',
    options.followingBillDenominationId ?? 'denomination-5', options.activeSkinId);

  // 正面朝观众（翻盖仍覆盖钱包面上部）：盖影随掀起收缩、条带绘制、掠射明度
  if (!backFaceVisible && faceVisibility > 0) {
    renderingContext.save();
    renderingContext.globalAlpha *= faceVisibility;
    clipProjectedFaceWidth(renderingContext, options, faceVisibility);
    paintFlapCastShadow(renderingContext, options);
    if (options.flapFaceSurfaces) {
      paintFlapWithStrips(renderingContext, options, 'front');
      paintFlapGrazingShade(renderingContext, options);
    } else {
      paintFlatFrontFace(renderingContext, options);
    }
    renderingContext.restore();
  }

  // 纹理淡出时逐渐显现铰链中央的窄切边，避免正反面交界跳出矩形。
  paintLeatherEdgeIfNeeded(renderingContext, options, 1 - faceVisibility);

  renderingContext.restore();
}

function clipProjectedFaceWidth(
  renderingContext: CanvasRenderingContext2D,
  options: WalletPaintOptions,
  faceVisibility: number,
): void {
  if (faceVisibility >= 1) return;
  const clipRect = flapFaceTransitionClipRect(
    options.walletRect, options.foldLineY, options.flapRotationDegrees, faceVisibility,
  );
  renderingContext.beginPath();
  renderingContext.rect(clipRect.left, clipRect.top, clipRect.width, clipRect.height);
  renderingContext.clip();
}

/** 缝线内框（虚线） */
function paintStitchingFrame(
  renderingContext: CanvasRenderingContext2D,
  stitchingRect: Rect,
  leatherColors: WalletLeatherPalette,
): void {
  renderingContext.save();
  renderingContext.setLineDash([5, 4]);
  renderingContext.strokeStyle = leatherColors.stitchingColorHex;
  renderingContext.lineWidth = 1.5;
  renderingContext.globalAlpha = 0.85;
  buildRoundedRectPath(renderingContext, stitchingRect, 12);
  renderingContext.stroke();
  renderingContext.restore();
}

/**
 * 条带透视投影：面部纹理按 FLAP_STRIP_COUNT 条带取样，按顶边铰链投影定位。
 * 源纹理约定：图像顶部 = 铰链侧、底部 = 自由边（与闭合悬挂朝向一致）。
 * 只对整个翻盖圆角轮廓做一次裁剪；条带之间以不足一个逻辑像素的范围重叠。
 * 这样可避开 WebKit 对相邻独立 clip 边缘分别抗锯齿而产生的透明横缝，
 * 同时让动画中的子像素移动保持连续，避免横缝逐帧闪烁。裁剪后的窄描边
 * 覆盖 WebKit 的二值裁剪台阶，画出抗锯齿的皮革圆角外沿。
 */
function paintFlapWithStrips(
  renderingContext: CanvasRenderingContext2D,
  options: WalletPaintOptions,
  face: 'front' | 'back',
): void {
  const { walletRect, foldLineY, flapRotationDegrees, flapFaceSurfaces } =
    options;
  if (!flapFaceSurfaces) return;
  const surface = face === 'front' ? flapFaceSurfaces.front : flapFaceSurfaces.back;
  const flapLengthPixels = foldLineY - walletRect.top;
  const walletCenterX = walletRect.left + walletRect.width / 2;
  const cornerRadiusPixels = face === 'front'
    ? FLAP_FRONT_CORNER_RADIUS_PIXELS
    : FLAP_BACK_CORNER_RADIUS_PIXELS;
  const projectedShape = projectRoundedFlapShapeInto(
    sharedFlapShapeBuffers,
    walletRect, foldLineY, flapRotationDegrees, cornerRadiusPixels,
  );
  const boundarySamples = projectedShape.stripBoundaries;
  const destinationOverlapPixels = 0.75;
  // 纹理缓存按渲染尺度放大过（防 drawImage 放大模糊）：源侧重叠随尺度补偿，保持 ~1 逻辑像素
  const sourceOverlapPixels = Math.max(1, surface.pixelHeight / flapLengthPixels);

  renderingContext.save();

  // 整体圆角轮廓只裁剪一次，内部不再出现多条经过抗锯齿的 clip 接缝。
  traceProjectedFlapOutline(renderingContext, projectedShape.outlineBoundaries);
  renderingContext.clip();

  for (let stripIndex = 0; stripIndex < FLAP_STRIP_COUNT; stripIndex += 1) {
    const parameterT0 = stripIndex / FLAP_STRIP_COUNT;
    const parameterT1 = (stripIndex + 1) / FLAP_STRIP_COUNT;
    const boundary0 = boundarySamples[stripIndex];
    const boundary1 = boundarySamples[stripIndex + 1];
    const stripTopY = Math.min(boundary0.y, boundary1.y) - destinationOverlapPixels;
    const stripHeightPixels =
      Math.abs(boundary1.y - boundary0.y) + destinationOverlapPixels * 2;
    const stripHalfWidthPixels = Math.max(boundary0.halfWidth, boundary1.halfWidth);

    // 源纹理和目标矩形都向相邻条带扩展；整体轮廓裁剪会收掉外缘的溢出。
    const sourceStripTop = Math.max(
      0,
      surface.pixelHeight * parameterT0 - sourceOverlapPixels,
    );
    const sourceStripBottom = Math.min(
      surface.pixelHeight,
      surface.pixelHeight * parameterT1 + sourceOverlapPixels,
    );
    const sourceStripHeight = sourceStripBottom - sourceStripTop;

    renderingContext.drawImage(
      surface.sourceSurface,
      0,
      sourceStripTop,
      surface.pixelWidth,
      sourceStripHeight,
      walletCenterX - stripHalfWidthPixels,
      stripTopY,
      stripHalfWidthPixels * 2,
      stripHeightPixels,
    );
  }
  renderingContext.restore();

  // 在裁剪外绘制矢量皮革切边；它的平滑外缘盖住 WebKit clip 的硬台阶。
  renderingContext.save();
  traceProjectedFlapOutline(renderingContext, projectedShape.outlineBoundaries);
  renderingContext.strokeStyle = face === 'front'
    ? options.walletLeatherPalette.bodyColorHex
    : options.walletLeatherPalette.liningColorHex;
  renderingContext.lineWidth = 1.5;
  renderingContext.lineJoin = 'round';
  renderingContext.stroke();
  renderingContext.restore();
}

function traceProjectedFlapOutline(
  renderingContext: CanvasRenderingContext2D,
  boundaries: ProjectedFlapBoundary[],
): void {
  renderingContext.beginPath();
  renderingContext.moveTo(boundaries[0].leftX, boundaries[0].y);
  for (let index = 1; index < boundaries.length; index += 1) {
    renderingContext.lineTo(boundaries[index].leftX, boundaries[index].y);
  }
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    renderingContext.lineTo(boundaries[index].rightX, boundaries[index].y);
  }
  renderingContext.closePath();
}

/** 掠射明度：正面随角度整体微降（转侧越暗），填充于投影梯形范围 */
function paintFlapGrazingShade(
  renderingContext: CanvasRenderingContext2D,
  options: WalletPaintOptions,
): void {
  const { walletRect, foldLineY, flapRotationDegrees } = options;
  if (flapRotationDegrees < 8) return;
  const flapLengthPixels = foldLineY - walletRect.top;
  const hingeY = walletRect.top;
  const walletCenterX = walletRect.left + walletRect.width / 2;
  const hingeSample = projectFlapPointAtParameter(
    0,
    flapRotationDegrees,
    flapLengthPixels,
    walletRect.width,
  );
  const edgeSample = projectFlapPointAtParameter(
    1,
    flapRotationDegrees,
    flapLengthPixels,
    walletRect.width,
  );
  const shadeAlpha = 0.2 * Math.sin((flapRotationDegrees * Math.PI) / 180);

  renderingContext.save();
  renderingContext.globalAlpha *= shadeAlpha;
  renderingContext.fillStyle = '#3D2C20';
  renderingContext.beginPath();
  renderingContext.moveTo(
    walletCenterX - hingeSample.halfWidthPixels,
    hingeY + hingeSample.offsetFromHingePixels,
  );
  renderingContext.lineTo(
    walletCenterX + hingeSample.halfWidthPixels,
    hingeY + hingeSample.offsetFromHingePixels,
  );
  renderingContext.lineTo(
    walletCenterX + edgeSample.halfWidthPixels,
    hingeY + edgeSample.offsetFromHingePixels,
  );
  renderingContext.lineTo(
    walletCenterX - edgeSample.halfWidthPixels,
    hingeY + edgeSample.offsetFromHingePixels,
  );
  renderingContext.closePath();
  renderingContext.fill();
  renderingContext.restore();
}

/** 翻盖在钱包面上的投影：随掀起向自由边收缩（自由边仍覆盖钱包面时） */
function paintFlapCastShadow(
  renderingContext: CanvasRenderingContext2D,
  options: WalletPaintOptions,
): void {
  const { walletRect, foldLineY, flapRotationDegrees } = options;
  if (flapRotationDegrees < 4) return;
  const flapLengthPixels = foldLineY - walletRect.top;
  const hingeY = walletRect.top;
  const edgeSample = projectFlapPointAtParameter(
    1,
    flapRotationDegrees,
    flapLengthPixels,
    walletRect.width,
  );
  if (edgeSample.offsetFromHingePixels <= 4) return;
  renderingContext.save();
  renderingContext.globalAlpha *= 0.14;
  renderingContext.fillStyle = '#3D2C20';
  buildRoundedRectPath(
    renderingContext,
    {
      left: walletRect.left + 3,
      top: hingeY + edgeSample.offsetFromHingePixels,
      width: walletRect.width - 6,
      height: 12,
    },
    6,
  );
  renderingContext.fill();
  renderingContext.restore();
}

/** 厚度兜底：以 8% 高度的切边围绕铰链平滑接替纹理表面。 */
function paintLeatherEdgeIfNeeded(
  renderingContext: CanvasRenderingContext2D,
  options: WalletPaintOptions,
  edgeVisibility: number,
): void {
  if (edgeVisibility <= 0) return;
  const { walletRect, foldLineY, flapRotationDegrees } = options;

  renderingContext.save();
  renderingContext.globalAlpha *= edgeVisibility;
  renderingContext.fillStyle = options.walletLeatherPalette.edgeColorHex;
  buildRoundedRectPath(
    renderingContext,
    flapLeatherEdgeRect(walletRect, foldLineY, flapRotationDegrees),
    3,
  );
  renderingContext.fill();
  renderingContext.restore();
}

/** 降级路径：平面正面（无离屏画布；规格降级场景）。沿顶边铰链的平面摆动。 */
function paintFlatFrontFace(
  renderingContext: CanvasRenderingContext2D,
  options: WalletPaintOptions,
): void {
  const { walletRect, foldLineY, flapRotationDegrees } = options;
  const leatherColors = options.walletLeatherPalette;
  const flapLengthPixels = foldLineY - walletRect.top;
  const hingeY = walletRect.top;
  const sample = projectFlapPointAtParameter(
    1,
    flapRotationDegrees,
    flapLengthPixels,
    walletRect.width,
  );
  const edgeY = hingeY + sample.offsetFromHingePixels;
  const flatTop = Math.min(hingeY, edgeY);
  const flatHeight = Math.max(2, Math.abs(sample.offsetFromHingePixels));
  const flatRect: Rect = {
    left: walletCenterXOf(options) - sample.halfWidthPixels,
    top: flatTop,
    width: sample.halfWidthPixels * 2,
    height: flatHeight,
  };
  buildRoundedRectPath(renderingContext, flatRect, 16);
  renderingContext.fillStyle = leatherColors.bodyColorHex;
  renderingContext.fill();
  if (flatHeight > 26) {
    paintStitchingFrame(renderingContext, {
      left: flatRect.left + 7,
      top: flatRect.top + 7,
      width: flatRect.width - 14,
      height: flatHeight - 12,
    }, leatherColors);
  }
}

function walletCenterXOf(options: WalletPaintOptions): number {
  return options.walletRect.left + options.walletRect.width / 2;
}

/**
 * 正面面部纹理（离屏预渲染）：绘制于 (0,0) 起的 width×height 区域，
 * 图像顶部 = 铰链侧、底部 = 自由边（钮扣靠近自由边）。供 Game 构建纹理缓存。
 */
export function drawFlapFrontFaceArt(
  renderingContext: CanvasRenderingContext2D,
  faceWidth: number,
  faceHeight: number,
  leatherColors: WalletLeatherPalette,
): void {
  const faceRect: Rect = { left: 0, top: 0, width: faceWidth, height: faceHeight };
  buildRoundedRectPath(renderingContext, faceRect, FLAP_FRONT_CORNER_RADIUS_PIXELS);
  renderingContext.fillStyle = leatherColors.bodyColorHex;
  renderingContext.fill();

  // 受光面：铰链侧（顶部）高光
  const highlightGradient = renderingContext.createLinearGradient(0, 0, 0, faceHeight);
  highlightGradient.addColorStop(0, 'rgba(255, 249, 239, 0.30)');
  highlightGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  buildRoundedRectPath(renderingContext, faceRect, FLAP_FRONT_CORNER_RADIUS_PIXELS);
  renderingContext.fillStyle = highlightGradient;
  renderingContext.fill();

  // 缝线 + 钮扣（钮扣靠近自由边 = 图像底部）
  renderingContext.save();
  renderingContext.setLineDash([5, 4]);
  renderingContext.strokeStyle = leatherColors.stitchingColorHex;
  renderingContext.lineWidth = 1.5;
  renderingContext.globalAlpha = 0.85;
  buildRoundedRectPath(
    renderingContext,
    { left: 7, top: 7, width: faceWidth - 14, height: faceHeight - 10 },
    12,
  );
  renderingContext.stroke();
  renderingContext.restore();
  renderingContext.beginPath();
  renderingContext.arc(faceWidth / 2, faceHeight - 12, 4, 0, Math.PI * 2);
  renderingContext.fillStyle = leatherColors.deepColorHex;
  renderingContext.fill();
}

/** 背面面部纹理（离屏预渲染）：内衬 + 皮革描边（同 (0,0) 锚定约定） */
export function drawFlapBackFaceArt(
  renderingContext: CanvasRenderingContext2D,
  faceWidth: number,
  faceHeight: number,
  leatherColors: WalletLeatherPalette,
): void {
  const faceRect: Rect = { left: 0, top: 0, width: faceWidth, height: faceHeight };
  buildRoundedRectPath(renderingContext, faceRect, FLAP_BACK_CORNER_RADIUS_PIXELS);
  renderingContext.fillStyle = leatherColors.liningColorHex;
  renderingContext.fill();

  const backGradient = renderingContext.createLinearGradient(0, 0, 0, faceHeight);
  backGradient.addColorStop(0, 'rgba(255, 249, 239, 0.20)');
  backGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  buildRoundedRectPath(renderingContext, faceRect, FLAP_BACK_CORNER_RADIUS_PIXELS);
  renderingContext.fillStyle = backGradient;
  renderingContext.fill();

}

/** 钱包口纸币堆：最后一层就是将被抽出的完整票面。 */
function paintBillStackPeek(
  renderingContext: CanvasRenderingContext2D,
  walletRect: Rect,
  foldLineY: number,
  hideTopStackLayer: boolean,
  topBillDenominationId: string,
  followingBillDenominationId: string,
  billSkinId?: string,
): void {
  const hingeY = walletRect.top;
  const interiorHeight = foldLineY - hingeY;
  const stackCenterX = walletRect.left + walletRect.width / 2;
  const topRect = billRectAtDrawRatio(walletRect, foldLineY, 0);

  renderingContext.save();
  // 裁剪到钱包内部区域：票面下半被钱包体裁掉，顶端在折线上方自然探出嘴部
  renderingContext.beginPath();
  renderingContext.rect(walletRect.left + 5, hingeY + 2, walletRect.width - 10, interiorHeight - 2);
  renderingContext.clip();

  for (let layerIndex = 0; layerIndex < BILL_STACK_LAYER_COUNT; layerIndex += 1) {
    const isTopLayer = layerIndex === BILL_STACK_LAYER_COUNT - 1;
    if (hideTopStackLayer && isTopLayer) continue;
    const denominationId = isTopLayer
      ? topBillDenominationId
      : layerIndex === BILL_STACK_LAYER_COUNT - 2
        ? followingBillDenominationId
      : BILL_STACK_DENOMINATION_IDS[layerIndex % BILL_STACK_DENOMINATION_IDS.length];
    const billRect: Rect = {
      ...topRect,
      top: topRect.top - (BILL_STACK_LAYER_COUNT - 1 - layerIndex) *
        BILL_STACK_LAYER_STRIDE_PIXELS,
    };

    renderingContext.save();
    renderingContext.translate(stackCenterX, foldLineY);
    if (!isTopLayer) renderingContext.rotate(((layerIndex % 3) - 1) * 0.014);
    renderingContext.translate(-stackCenterX, -foldLineY);
    paintLaiBanknote(renderingContext, billRect, denominationId, 0, billSkinId);

    renderingContext.restore();
  }
  renderingContext.restore();
}
