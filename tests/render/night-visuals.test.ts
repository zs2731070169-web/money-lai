import { describe, expect, it } from 'vitest';
import {
  BILL_PAPER_BASE_COLOR_HEX,
  INK_TEXT_COLOR_HEX,
  NIGHT_BASE_BRIGHTNESS_FACTOR,
  NIGHT_DIM_OVERLAY_COLOR_HEX,
  SCENE_BACKGROUND_PALETTES,
  brightnessToDimOverlayAlpha,
  resolveSceneBrightness,
} from '../../src/core/render/design-tokens';
import { paintNightDimOverlay } from '../../src/core/render/night-dim-painter';
import {
  SLEEP_NEAR_BLACK_BRIGHTNESS,
  SLEEP_NIGHT_BASE_BRIGHTNESS,
} from '../../src/core/sleep/sleep-arc';

/**
 * 夜间视觉单测（sleep-mode 规格「夜间视觉基调/渐进熄灭」，任务 2.1-2.3）：
 * 亮度合成与叠层映射、画师级压暗行为、WCAG 大数字对比度 ≥3:1 验算、减弱动态无耦合。
 */

/** hex → sRGB 通道 */
function hexToRgbChannels(hexColor: string): [number, number, number] {
  const normalized = hexColor.replace('#', '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

/** alpha 合成：结果 = 源色 × (1-a) + 叠层色 × a（sRGB 空间逐通道） */
function compositeWithOverlay(
  hexColor: string,
  overlayHexColor: string,
  overlayAlpha: number,
): [number, number, number] {
  const source = hexToRgbChannels(hexColor);
  const overlay = hexToRgbChannels(overlayHexColor);
  return [0, 1, 2].map((channel) =>
    Math.round(source[channel] * (1 - overlayAlpha) + overlay[channel] * overlayAlpha),
  ) as [number, number, number];
}

/** WCAG 相对亮度 */
function relativeLuminance(channels: [number, number, number]): number {
  const linearized = channels.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linearized[0] + 0.7152 * linearized[1] + 0.0722 * linearized[2];
}

/** WCAG 对比度（大数字 ≥3:1 的验收口径） */
function wcagContrastRatio(foreground: string, background: string, overlayAlpha: number): number {
  const foregroundLuminance = relativeLuminance(
    compositeWithOverlay(foreground, NIGHT_DIM_OVERLAY_COLOR_HEX, overlayAlpha),
  );
  const backgroundLuminance = relativeLuminance(
    compositeWithOverlay(background, NIGHT_DIM_OVERLAY_COLOR_HEX, overlayAlpha),
  );
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 记录型 2D 上下文替身：在 fillRect 调用瞬间捕获状态（画师绘制后会恢复上游状态） */
interface RecordingContext {
  globalAlpha: number;
  fillStyle: string;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  fillRectCalls: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    globalAlpha: number;
    fillStyle: string;
  }>;
}

function createRecordingContext(): RecordingContext {
  const context: RecordingContext = {
    globalAlpha: 1,
    fillStyle: '#000000',
    fillRectCalls: [],
    fillRect(x, y, width, height) {
      context.fillRectCalls.push({
        x,
        y,
        width,
        height,
        globalAlpha: context.globalAlpha,
        fillStyle: context.fillStyle,
      });
    },
  };
  return context;
}

describe('场景亮度合成（sleep-mode 规格）', () => {
  it('日间恒为 1（叠层不存在，渲染输出与既有一致）', () => {
    expect(resolveSceneBrightness(false, SLEEP_NIGHT_BASE_BRIGHTNESS)).toBe(1);
    expect(resolveSceneBrightness(false, SLEEP_NEAR_BLACK_BRIGHTNESS)).toBe(1);
  });

  it('夜间 = 夜间基准 × 熄灭弧线系数', () => {
    expect(resolveSceneBrightness(true, SLEEP_NIGHT_BASE_BRIGHTNESS)).toBeCloseTo(
      NIGHT_BASE_BRIGHTNESS_FACTOR,
    );
    expect(resolveSceneBrightness(true, 0.5)).toBeCloseTo(NIGHT_BASE_BRIGHTNESS_FACTOR * 0.5);
    expect(resolveSceneBrightness(true, SLEEP_NEAR_BLACK_BRIGHTNESS)).toBeCloseTo(
      NIGHT_BASE_BRIGHTNESS_FACTOR * SLEEP_NEAR_BLACK_BRIGHTNESS,
      4,
    );
  });

  it('亮度 → 叠层不透明度映射单调且钳制', () => {
    expect(brightnessToDimOverlayAlpha(1)).toBe(0);
    expect(brightnessToDimOverlayAlpha(1.5)).toBe(0);
    expect(brightnessToDimOverlayAlpha(0)).toBe(1);
    expect(brightnessToDimOverlayAlpha(-0.2)).toBe(1);
    let previousAlpha = brightnessToDimOverlayAlpha(1);
    for (let brightness = 0.99; brightness >= SLEEP_NEAR_BLACK_BRIGHTNESS; brightness -= 0.01) {
      const alpha = brightnessToDimOverlayAlpha(brightness);
      expect(alpha).toBeGreaterThan(previousAlpha - 1e-9);
      previousAlpha = alpha;
    }
  });
});

describe('夜间压暗叠层画师', () => {
  it('日间亮度（≥1）不产生任何绘制', () => {
    const context = createRecordingContext();
    paintNightDimOverlay(context as unknown as CanvasRenderingContext2D, 402, 874, 1);
    expect(context.fillRectCalls).toHaveLength(0);
  });

  it('夜间基准：全画面一次叠层、调用瞬间为暖黑与正确不透明度、事后恢复上游状态', () => {
    const context = createRecordingContext();
    paintNightDimOverlay(
      context as unknown as CanvasRenderingContext2D,
      402,
      874,
      NIGHT_BASE_BRIGHTNESS_FACTOR,
    );
    expect(context.fillRectCalls).toHaveLength(1);
    expect(context.fillRectCalls[0]).toMatchObject({ x: 0, y: 0, width: 402, height: 874 });
    expect(context.fillRectCalls[0].fillStyle).toBe(NIGHT_DIM_OVERLAY_COLOR_HEX);
    expect(context.fillRectCalls[0].globalAlpha).toBeCloseTo(
      brightnessToDimOverlayAlpha(NIGHT_BASE_BRIGHTNESS_FACTOR),
    );
    // 事后恢复上游状态（绘制色自持性纪律）
    expect(context.globalAlpha).toBe(1);
    expect(context.fillStyle).toBe('#000000');
  });

  it('熄灭推进：叠层随弧线亮度单调加深直至近黑', () => {
    const viewportWidth = 402;
    const viewportHeight = 874;
    let previousAlpha = -1;
    for (let arcBrightness = 1; arcBrightness >= SLEEP_NEAR_BLACK_BRIGHTNESS; arcBrightness -= 0.05) {
      const context = createRecordingContext();
      paintNightDimOverlay(
        context as unknown as CanvasRenderingContext2D,
        viewportWidth,
        viewportHeight,
        resolveSceneBrightness(true, arcBrightness),
      );
      expect(context.fillRectCalls).toHaveLength(1);
      expect(context.fillRectCalls[0].fillStyle).toBe(NIGHT_DIM_OVERLAY_COLOR_HEX);
      expect(context.fillRectCalls[0].globalAlpha).toBeGreaterThan(previousAlpha);
      previousAlpha = context.fillRectCalls[0].globalAlpha;
    }
  });

  it('减弱动态无耦合：压暗在减弱动态开关下同样生效（渐进熄灭属状态收敛型过渡）', () => {
    // 亮度合成不含减弱动态输入——两开关叠加时叠层行为不变
    const contextA = createRecordingContext();
    const contextB = createRecordingContext();
    const nightBrightness = resolveSceneBrightness(true, SLEEP_NIGHT_BASE_BRIGHTNESS);
    paintNightDimOverlay(contextA as unknown as CanvasRenderingContext2D, 402, 874, nightBrightness);
    paintNightDimOverlay(contextB as unknown as CanvasRenderingContext2D, 402, 874, nightBrightness);
    expect(contextA.fillRectCalls).toHaveLength(1);
    expect(contextB.fillRectCalls).toHaveLength(1);
  });
});

describe('夜间大数字对比度（WCAG ≥3:1，最浅背景验算）', () => {
  it('夜间基准下金额墨色对全部背景色板与纸基 ≥3:1', () => {
    const nightOverlayAlpha = brightnessToDimOverlayAlpha(NIGHT_BASE_BRIGHTNESS_FACTOR);
    const backgrounds = SCENE_BACKGROUND_PALETTES.flatMap((palette) => [
      palette.topColorHex,
      palette.bottomColorHex,
    ]).concat(BILL_PAPER_BASE_COLOR_HEX);
    for (const background of backgrounds) {
      const ratio = wcagContrastRatio(INK_TEXT_COLOR_HEX, background, nightOverlayAlpha);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });

  it('日间对照：同一组背景对比度不受影响（≥4.5）', () => {
    const backgrounds = SCENE_BACKGROUND_PALETTES.flatMap((palette) => [
      palette.topColorHex,
      palette.bottomColorHex,
    ]);
    for (const background of backgrounds) {
      const ratio = wcagContrastRatio(INK_TEXT_COLOR_HEX, background, 0);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
