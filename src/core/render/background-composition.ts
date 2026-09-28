import type { Rect } from './letter-layout';

/**
 * 横构图背景（1536×1024）在竖屏视口上的自适应合成规划。
 *
 * 源图四角是水彩装饰、中央是干净纸面；竖屏若按高度 cover 裁切，
 * 左右各裁掉约三分之一宽度，四角装饰几乎全部丢失。
 * 这里改为：底层取「避开装饰的中央纸面带」铺满视口，再把四角装饰
 * 等比缩放移植到视口四角并只向内侧羽化，保证任意竖屏比例下
 * 构图完整；视口足够宽（比例不低于源图）时返回 null，维持纯 cover。
 */

export const BACKGROUND_SOURCE_WIDTH = 1536;
export const BACKGROUND_SOURCE_HEIGHT = 1024;

export type BackgroundCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

/** 四角装饰在源图中的采样包围盒（源像素，随资产更新时同步标定）。 */
const CORNER_SAMPLES: Record<BackgroundCorner, Rect> = {
  topLeft: { left: 0, top: 0, width: 384, height: 472 },
  topRight: { left: 1120, top: 0, width: 416, height: 410 },
  bottomLeft: { left: 0, top: 532, width: 400, height: 492 },
  bottomRight: { left: 922, top: 410, width: 614, height: 614 },
};

/**
 * 各角目标尺寸：宽度占视口宽的比例、高度占视口高的上限，
 * 二者取更约束的一方并保持源纵横比（装饰不拉伸）。
 * 竖屏里上两角完整可见、下两角大半被信封遮挡，故上重下轻。
 */
const CORNER_TARGETS: Record<BackgroundCorner, { widthRatio: number; maxHeightRatio: number }> = {
  topLeft: { widthRatio: 0.58, maxHeightRatio: 0.28 },
  topRight: { widthRatio: 0.56, maxHeightRatio: 0.26 },
  bottomLeft: { widthRatio: 0.36, maxHeightRatio: 0.2 },
  bottomRight: { widthRatio: 0.52, maxHeightRatio: 0.22 },
};

/** 角落装饰沿内向边缘的羽化起点（0-1，其余区间保持不透明）。 */
const CORNER_FADE_START = 0.62;

export interface BackgroundCornerPlacement {
  corner: BackgroundCorner;
  /** 源图采样区（源像素）。 */
  source: Rect;
  /** 归一化目标区（占视口宽高的比例）。 */
  destination: Rect;
  /** 向内羽化起点（0-1）。 */
  fadeStart: number;
}

export interface AdaptiveBackgroundPlan {
  /** 底层纸面采样带（源像素），与视口严格等比且完全避开四角装饰。 */
  baseBand: { sourceLeft: number; sourceTop: number; sourceWidth: number; sourceHeight: number };
  placements: BackgroundCornerPlacement[];
}

/** 视口不窄于源图比例时返回 null：纯 cover 即可完整呈现四角。 */
export function planAdaptiveBackground(viewportWidth: number, viewportHeight: number): AdaptiveBackgroundPlan | null {
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  const viewportAspect = viewportWidth / viewportHeight;
  if (viewportAspect >= BACKGROUND_SOURCE_WIDTH / BACKGROUND_SOURCE_HEIGHT) return null;

  // 底层采样带：与视口严格等比（纸纹不拉伸）；水平宽度钳制在无装饰区间内居中，
  // 钳制生效时按等比垂直居中收窄，保证任何机型底层都是纯纸面且无装饰叠印。
  // min 构造保证 sourceWidth ≤ viewportAspect×1024，故 sourceHeight 恒 ≤ 1024
  const decorationFreeLeft = Math.max(CORNER_SAMPLES.topLeft.width, CORNER_SAMPLES.bottomLeft.width);
  const decorationFreeRight = Math.min(CORNER_SAMPLES.topRight.left, CORNER_SAMPLES.bottomRight.left);
  const decorationFreeWidth = decorationFreeRight - decorationFreeLeft;
  const sourceWidth = Math.min(viewportAspect * BACKGROUND_SOURCE_HEIGHT, decorationFreeWidth);
  const sourceHeight = sourceWidth / viewportAspect;
  const sourceLeft = decorationFreeLeft + (decorationFreeWidth - sourceWidth) / 2;
  const sourceTop = (BACKGROUND_SOURCE_HEIGHT - sourceHeight) / 2;

  const placements = (Object.keys(CORNER_SAMPLES) as BackgroundCorner[]).map((corner) => {
    const sample = CORNER_SAMPLES[corner];
    const target = CORNER_TARGETS[corner];
    // 保持源纵横比换算归一化宽高，超上限时以高度反解宽度
    let width = target.widthRatio;
    let height = (width * viewportWidth) / (viewportHeight * (sample.width / sample.height));
    if (height > target.maxHeightRatio) {
      height = target.maxHeightRatio;
      width = (height * viewportHeight * (sample.width / sample.height)) / viewportWidth;
    }
    const destination: Rect = {
      left: corner === 'topLeft' || corner === 'bottomLeft' ? 0 : 1 - width,
      top: corner === 'topLeft' || corner === 'topRight' ? 0 : 1 - height,
      width,
      height,
    };
    return { corner, source: sample, destination, fadeStart: CORNER_FADE_START };
  });

  return { baseBand: { sourceLeft, sourceTop, sourceWidth, sourceHeight }, placements };
}

/** 合成所需的最小画布能力（平台 createOffscreenCanvas 的结构子集）。 */
export interface BackgroundCompositionSurface {
  renderingContext: CanvasRenderingContext2D;
  sourceSurface: CanvasImageSource;
}

const OPAQUE_MASK = 'rgba(0,0,0,1)';
const TRANSPARENT_MASK = 'rgba(0,0,0,0)';

/**
 * 把规划绘制到 target（设备像素坐标系，无变换）：
 * 底层纸面带铺满后，逐角在独立层上以 destination-in 双向羽化，再贴回目标。
 * 角层分配失败时跳过该角，底层纸面仍完整覆盖视口。
 */
export function paintAdaptiveBackground(
  target: BackgroundCompositionSurface,
  source: CanvasImageSource,
  plan: AdaptiveBackgroundPlan,
  pixelWidth: number,
  pixelHeight: number,
  createLayer: (layerWidth: number, layerHeight: number) => BackgroundCompositionSurface | null,
): void {
  const context = target.renderingContext;
  context.drawImage(
    source,
    plan.baseBand.sourceLeft, plan.baseBand.sourceTop, plan.baseBand.sourceWidth, plan.baseBand.sourceHeight,
    0, 0, pixelWidth, pixelHeight,
  );

  for (const placement of plan.placements) {
    const layerWidth = Math.max(1, Math.round(placement.destination.width * pixelWidth));
    const layerHeight = Math.max(1, Math.round(placement.destination.height * pixelHeight));
    const layer = createLayer(layerWidth, layerHeight);
    if (!layer) continue;
    const layerContext = layer.renderingContext;
    layerContext.drawImage(
      source,
      placement.source.left, placement.source.top, placement.source.width, placement.source.height,
      0, 0, layerWidth, layerHeight,
    );

    // 只向视口内侧羽化：贴屏幕外缘的一侧全程保持不透明平台期，向内侧渐隐
    const fadeStart = Math.min(0.999, Math.max(0, placement.fadeStart));
    const horizontal = layerContext.createLinearGradient(0, 0, layerWidth, 0);
    const vertical = layerContext.createLinearGradient(0, 0, 0, layerHeight);
    const anchoredLeft = placement.corner === 'topLeft' || placement.corner === 'bottomLeft';
    const anchoredTop = placement.corner === 'topLeft' || placement.corner === 'topRight';
    for (const [gradient, anchoredAtStart] of [[horizontal, anchoredLeft], [vertical, anchoredTop]] as const) {
      // 锚定侧（贴屏幕边缘）保持不透明平台期至 fadeStart，再向内侧渐隐；非锚定侧镜像同理
      if (anchoredAtStart) {
        gradient.addColorStop(0, OPAQUE_MASK);
        gradient.addColorStop(fadeStart, OPAQUE_MASK);
        gradient.addColorStop(1, TRANSPARENT_MASK);
      } else {
        gradient.addColorStop(0, TRANSPARENT_MASK);
        gradient.addColorStop(1 - fadeStart, OPAQUE_MASK);
        gradient.addColorStop(1, OPAQUE_MASK);
      }
    }
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.fillStyle = horizontal;
    layerContext.fillRect(0, 0, layerWidth, layerHeight);
    layerContext.fillStyle = vertical;
    layerContext.fillRect(0, 0, layerWidth, layerHeight);
    layerContext.globalCompositeOperation = 'source-over';

    context.drawImage(
      layer.sourceSurface,
      placement.destination.left * pixelWidth, placement.destination.top * pixelHeight, layerWidth, layerHeight,
    );
  }
}
