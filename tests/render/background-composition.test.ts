import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import {
  BACKGROUND_SOURCE_HEIGHT, BACKGROUND_SOURCE_WIDTH,
  paintAdaptiveBackground, planAdaptiveBackground,
  type AdaptiveBackgroundPlan, type BackgroundCompositionSurface,
} from '../../src/core/render/background-composition';
import { FakePlatform } from '../helpers/fake-platform';
import { computeMenuLayout } from '../../src/core/render/menu-layout';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { LETTER_THEMES } from '../../src/core/render/letter-theme';
import { computePageItemRects } from '../../src/core/render/app-overlay-painter';

const NEAR = 1e-9;

/** 与实现标定同步的期望值（源像素）。 */
const SAMPLE_BOXES = {
  topLeft: { width: 384 },
  topRight: { left: 1120 },
  bottomLeft: { width: 400 },
  bottomRight: { left: 922 },
} as const;
const DECORATION_FREE_LEFT = Math.max(SAMPLE_BOXES.topLeft.width, SAMPLE_BOXES.bottomLeft.width);
const DECORATION_FREE_RIGHT = Math.min(SAMPLE_BOXES.topRight.left, SAMPLE_BOXES.bottomRight.left);

const PHONE_SIZES: Array<[string, number, number]> = [
  ['iPhone 19.5:9', 393, 852],
  ['Android 20:9', 360, 800],
  ['iPhone SE 16:9', 375, 667],
  ['小屏', 320, 568],
  ['近方形平板竖屏', 768, 1024],
  ['近门限 4:3 横向', 1024, 768],
  ['方形', 1000, 1000],
];

describe('背景竖屏自适应规划', () => {
  it('视口不窄于源图比例或尺寸非法时返回 null，维持纯 cover', () => {
    expect(planAdaptiveBackground(1600, 900)).toBeNull();
    expect(planAdaptiveBackground(BACKGROUND_SOURCE_WIDTH, BACKGROUND_SOURCE_HEIGHT)).toBeNull();
    expect(planAdaptiveBackground(0, 800)).toBeNull();
    expect(planAdaptiveBackground(393, 0)).toBeNull();
  });

  it.each(PHONE_SIZES)('%s（%dx%d）四角齐全、锚定正确、不变形且高度受钳制', (_label, width, height) => {
    const plan = planAdaptiveBackground(width, height);
    expect(plan).not.toBeNull();

    const heightCaps = { topLeft: 0.28, topRight: 0.26, bottomLeft: 0.2, bottomRight: 0.22 } as const;
    expect(plan!.placements.map((item) => item.corner)).toEqual(['topLeft', 'topRight', 'bottomLeft', 'bottomRight']);
    for (const placement of plan!.placements) {
      const { destination, source } = placement;
      // 锚定：目标区靠齐视口对应角
      expect(destination.left).toBeCloseTo(placement.corner.endsWith('Right') ? 1 - destination.width : 0, 9);
      expect(destination.top).toBeCloseTo(placement.corner.startsWith('bottom') ? 1 - destination.height : 0, 9);
      // 纵横比锁定：目标与源采样等比，不拉伸装饰
      expect((destination.width * width) / (destination.height * height)).toBeCloseTo(source.width / source.height, 6);
      // 采样区在源图范围内
      expect(source.left + source.width).toBeLessThanOrEqual(BACKGROUND_SOURCE_WIDTH);
      expect(source.top + source.height).toBeLessThanOrEqual(BACKGROUND_SOURCE_HEIGHT);
      // 高度上限钳制
      expect(destination.height).toBeLessThanOrEqual(heightCaps[placement.corner] + NEAR);
      expect(destination.width).toBeGreaterThan(0);
    }
  });

  it.each(PHONE_SIZES)('%s（%dx%d）底层采样带避开装饰且与视口严格等比', (_label, width, height) => {
    const plan = planAdaptiveBackground(width, height)!;
    const { sourceLeft, sourceTop, sourceWidth, sourceHeight } = plan.baseBand;
    expect(sourceLeft).toBeGreaterThanOrEqual(DECORATION_FREE_LEFT - NEAR);
    expect(sourceLeft + sourceWidth).toBeLessThanOrEqual(DECORATION_FREE_RIGHT + NEAR);
    expect(sourceTop).toBeGreaterThanOrEqual(0);
    expect(sourceTop + sourceHeight).toBeLessThanOrEqual(BACKGROUND_SOURCE_HEIGHT + NEAR);
    // 与视口等比：底层纸纹不被非均匀拉伸
    expect(sourceWidth / sourceHeight).toBeCloseTo(width / height, 6);
  });
});

interface RecordedGradient {
  axis: number[];
  stops: Array<{ offset: number; color: string }>;
  addColorStop(offset: number, color: string): void;
}

/** 记录型合成面：捕获 drawImage 参数、遮罩渐变轴向与 stops、混合模式切换。 */
function createRecordingSurface(id: string, records: {
  imageDraws: number[][];
  gradients: RecordedGradient[];
  compositeOperations: string[];
}): BackgroundCompositionSurface {
  const recordingContext = new Proxy({}, {
    get(_target, property) {
      if (property === 'drawImage') return (_image: unknown, ...args: number[]) => records.imageDraws.push(args);
      if (property === 'fillRect') return () => undefined;
      if (property === 'createLinearGradient') return (x0: number, y0: number, x1: number, y1: number) => {
        const gradient: RecordedGradient = {
          axis: [x0, y0, x1, y1],
          stops: [],
          addColorStop(offset, color) { gradient.stops.push({ offset, color }); },
        };
        records.gradients.push(gradient);
        return gradient;
      };
      return undefined;
    },
    set(_target, property, value) {
      if (property === 'globalCompositeOperation') records.compositeOperations.push(String(value));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { renderingContext: recordingContext, sourceSurface: { id } as unknown as CanvasImageSource };
}

describe('背景合成绘制', () => {
  const PLAN: AdaptiveBackgroundPlan = planAdaptiveBackground(393, 852)!;

  it('先铺底层纸面带，再按四角目标贴羽化装饰层', () => {
    const targetRecords = { imageDraws: [] as number[][], gradients: [] as RecordedGradient[], compositeOperations: [] as string[] };
    const target = createRecordingSurface('target', targetRecords);
    const layerRecords: Array<{ imageDraws: number[][]; gradients: RecordedGradient[]; compositeOperations: string[] }> = [];
    const source = { id: 'source' } as unknown as CanvasImageSource;

    paintAdaptiveBackground(target, source, PLAN, 786, 1704, (layerWidth, layerHeight) => {
      expect(layerWidth).toBeGreaterThan(0);
      expect(layerHeight).toBeGreaterThan(0);
      const records = { imageDraws: [] as number[][], gradients: [] as RecordedGradient[], compositeOperations: [] as string[] };
      layerRecords.push(records);
      return createRecordingSurface(`layer-${layerRecords.length}`, records);
    });

    // 底层：无装饰纸面带铺满目标
    expect(targetRecords.imageDraws[0])
      .toEqual([PLAN.baseBand.sourceLeft, PLAN.baseBand.sourceTop, PLAN.baseBand.sourceWidth, PLAN.baseBand.sourceHeight, 0, 0, 786, 1704]);

    // 四角：每角一次源采样、两段 destination-in 遮罩后复位混合模式
    expect(layerRecords).toHaveLength(4);
    for (const records of layerRecords) {
      expect(records.compositeOperations).toEqual(['destination-in', 'source-over']);
      expect(records.gradients).toHaveLength(2);
    }

    // 贴回目标共 4 次，坐标按归一化目标区换算（设备像素 786×1704 = 393×852 × 2）
    expect(targetRecords.imageDraws).toHaveLength(5);
    const topLeft = PLAN.placements.find((item) => item.corner === 'topLeft')!;
    expect(targetRecords.imageDraws[1][0]).toBeCloseTo(topLeft.destination.left * 786, 6);
    expect(targetRecords.imageDraws[1][1]).toBeCloseTo(topLeft.destination.top * 1704, 6);
    const bottomRight = PLAN.placements.find((item) => item.corner === 'bottomRight')!;
    expect(targetRecords.imageDraws[4][0]).toBeCloseTo(bottomRight.destination.left * 786, 6);
    expect(targetRecords.imageDraws[4][1]).toBeCloseTo(bottomRight.destination.top * 1704, 6);

    // 羽化语义：左上角横/纵遮罩都从屏幕外缘起保持不透明平台期至 0.62，再向内渐隐到透明
    const topLeftStops = [
      { offset: 0, color: 'rgba(0,0,0,1)' },
      { offset: 0.62, color: 'rgba(0,0,0,1)' },
      { offset: 1, color: 'rgba(0,0,0,0)' },
    ];
    expect(layerRecords[0].gradients[0].axis).toEqual([0, 0, layerRecords[0].imageDraws[0][6], 0]);
    expect(layerRecords[0].gradients[1].axis).toEqual([0, 0, 0, layerRecords[0].imageDraws[0][7]]);
    expect(layerRecords[0].gradients[0].stops).toEqual(topLeftStops);
    expect(layerRecords[0].gradients[1].stops).toEqual(topLeftStops);
    // 右下角镜像：内侧（x=0）透明，从 0.38 渐入至屏幕外缘（x=1）全程不透明
    expect(layerRecords[3].gradients[0].stops).toEqual([
      { offset: 0, color: 'rgba(0,0,0,0)' },
      { offset: 0.38, color: 'rgba(0,0,0,1)' },
      { offset: 1, color: 'rgba(0,0,0,1)' },
    ]);
  });

  it('角层分配失败时跳过该角，底层纸面仍铺满视口', () => {
    const targetRecords = { imageDraws: [] as number[][], gradients: [] as RecordedGradient[], compositeOperations: [] as string[] };
    paintAdaptiveBackground(createRecordingSurface('target', targetRecords), {} as CanvasImageSource, PLAN, 393, 852, () => null);
    expect(targetRecords.imageDraws)
      .toEqual([[PLAN.baseBand.sourceLeft, PLAN.baseBand.sourceTop, PLAN.baseBand.sourceWidth, PLAN.baseBand.sourceHeight, 0, 0, 393, 852]]);
  });
});

describe('背景合成接线（Game 集成）', () => {
  function createGameWithBackground() {
    const platform = new FakePlatform();
    platform.bundledImage = { id: 'background' } as unknown as CanvasImageSource;
    const game = new Game({
      platformAdapter: platform,
      letterThemeAssetUrls: { topic1: { background: 'bg.png', closedEnvelope: 'c.png', openEnvelope: 'o.png', letterPaper: 'p.png' } },
    });
    return { platform, game };
  }

  it('竖屏首帧合成（1 底 + 4 角），同尺寸稳态不重算，resize 稳定后重合成，横屏清除不分配', async () => {
    const { platform, game } = createGameWithBackground();
    await game.start();
    platform.tick(16);
    const firstFrameAllocations = platform.offscreenCanvasCalls;
    expect(firstFrameAllocations).toBe(5);
    // 同尺寸稳态：缓存命中，零分配
    platform.tick(16);
    platform.tick(16);
    expect(platform.offscreenCanvasCalls).toBe(firstFrameAllocations);
    // 视口变化：180ms 稳定窗口内沿用旧合成面，之后按新尺寸重合成
    platform.viewport.width = 375;
    platform.viewport.height = 667;
    platform.tick(16);
    expect(platform.offscreenCanvasCalls).toBe(firstFrameAllocations);
    platform.tick(200);
    expect(platform.offscreenCanvasCalls).toBe(firstFrameAllocations + 5);
    // 视口不窄于源图比例：清合成层走原图 cover，无新增分配
    platform.viewport.width = 1200;
    platform.viewport.height = 800;
    platform.tick(16);
    expect(platform.offscreenCanvasCalls).toBe(firstFrameAllocations + 5);
  });

  it('合成分面持续失败时同尺寸每帧只尝试一次，尺寸变化后自然恢复', async () => {
    const { platform, game } = createGameWithBackground();
    platform.offscreenCanvasSucceeds = false;
    await game.start();
    platform.tick(16);
    expect(platform.offscreenCanvasCalls).toBe(1);
    platform.tick(16);
    expect(platform.offscreenCanvasCalls).toBe(1);
    platform.offscreenCanvasSucceeds = true;
    platform.viewport.width = 390;
    platform.viewport.height = 844;
    platform.tick(16);
    expect(platform.offscreenCanvasCalls).toBe(6);
  });

  it('主题切换整套重载后强制重合成（含重复点选当前主题不重载）', async () => {
    const { platform, game } = createGameWithBackground();
    await game.start();
    platform.tick(16);
    const initialAllocations = platform.offscreenCanvasCalls;
    expect(initialAllocations).toBe(5);
    // 进入主题页并点选另一套主题（当前只有 topic1，用菜单路由模拟激活路径）
    const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    platform.touch('start', scene.menuRect.left + 24, scene.menuRect.top + 24); platform.touch('end', scene.menuRect.left + 24, scene.menuRect.top + 24);
    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    const themeRow = menu.rows.find((row) => row.action === 'themes');
    if (!themeRow) throw new Error('菜单缺少主题入口');
    platform.touch('start', themeRow.rect.left + 20, themeRow.rect.top + themeRow.rect.height / 2); platform.touch('end', themeRow.rect.left + 20, themeRow.rect.top + themeRow.rect.height / 2);
    // 同主题重复点选：状态幂等，不触发资产重载与重合成
    const rects = computePageItemRects(platform.viewport.width, platform.safe, LETTER_THEMES.length);
    const pickX = rects[0].left + 20; const pickY = rects[0].top + rects[0].height / 2;
    platform.touch('start', pickX, pickY); platform.touch('end', pickX, pickY);
    await Promise.resolve();
    platform.tick(16);
    expect(platform.offscreenCanvasCalls).toBe(initialAllocations);
  });
});
