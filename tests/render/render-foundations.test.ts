import { describe, expect, it } from 'vitest';
import { CASH_DENOMINATIONS } from '../../src/core/cash/denomination';
import { createAmountOdometerState } from '../../src/core/cash/odometer';
import {
  DENOMINATION_COLOR_MAP,
  INK_TEXT_COLOR_HEX,
  MILESTONE_FLASH_COLOR_HEX,
  NIGHT_BASE_BRIGHTNESS_FACTOR,
  NIGHT_DIM_OVERLAY_COLOR_HEX,
  SCENE_BACKGROUND_PALETTES,
  WALLET_LEATHER_COLORS,
  assertDesignTokenCoverage,
} from '../../src/core/render/design-tokens';
import { computeSceneLayout } from '../../src/core/render/scene-layout';
import { paintAmountOdometer } from '../../src/core/render/odometer-painter';
import { blendCssColor } from '../../src/core/utility/color-utilities';
import {
  BACKGROUND_DRIFT_CROSSFADE_SECONDS,
  BACKGROUND_DRIFT_PHASE_SECONDS,
  interpolateSceneBackgroundColorAtElapsed,
} from '../../src/core/render/background-painter';

/**
 * 渲染基础单测（任务 6.1 验证入口）：
 * 设计令牌快照一致性（含面额全覆盖）、场景布局安全区与构图、背景漂移时序、
 * 金额里程表货币符号的绘制色自持性（不继承上游画师残留 fillStyle）。
 */

describe('设计令牌快照（与设计稿 D4 一致）', () => {
  it('背景色板三组：黄昏/清晨/暮霭', () => {
    expect(SCENE_BACKGROUND_PALETTES).toEqual([
      { name: '黄昏', topColorHex: '#F7EFE4', bottomColorHex: '#F1DEC9' },
      { name: '清晨', topColorHex: '#F3F1E8', bottomColorHex: '#E7EBDF' },
      { name: '暮霭', topColorHex: '#F4E9E3', bottomColorHex: '#E9D9D2' },
    ]);
  });

  it('皮革配色快照', () => {
    expect(WALLET_LEATHER_COLORS).toEqual({
      bodyColorHex: '#B08968',
      shadowColorHex: '#97755A',
      deepColorHex: '#8C6647',
      stitchingColorHex: '#F2E5D0',
      liningColorHex: '#6B7F74',
    });
  });

  it('每档面额都有专属色相（令牌完整性守卫）', () => {
    expect(() => assertDesignTokenCoverage()).not.toThrow();
    expect(DENOMINATION_COLOR_MAP['denomination-100'].baseColorHex).toBe('#E8C37E');
    expect(CASH_DENOMINATIONS.length).toBe(Object.keys(DENOMINATION_COLOR_MAP).length);
  });

  it('夜间基调令牌快照（sleep-mode 规格）', () => {
    expect(NIGHT_BASE_BRIGHTNESS_FACTOR).toBe(0.55);
    expect(NIGHT_DIM_OVERLAY_COLOR_HEX).toBe('#181109');
  });
});

describe('场景布局（安全区与构图）', () => {
  const IPHONE_17_VIEWPORT = { width: 402, height: 874 };
  const NOTCH_SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };

  it('里程表与元进程入口均在安全区内', () => {
    const layout = computeSceneLayout(
      IPHONE_17_VIEWPORT.width,
      IPHONE_17_VIEWPORT.height,
      NOTCH_SAFE_AREA,
    );
    expect(layout.odometerAnchor.topY).toBeGreaterThanOrEqual(NOTCH_SAFE_AREA.top + 60);
    expect(layout.metaEntryAnchor.centerY).toBeGreaterThanOrEqual(NOTCH_SAFE_AREA.top + 30);
    expect(layout.metaEntryAnchor.centerX).toBeLessThanOrEqual(
      IPHONE_17_VIEWPORT.width - NOTCH_SAFE_AREA.right - 20,
    );
  });

  it('钱包水平居中、置于中下部且不出屏', () => {
    const layout = computeSceneLayout(
      IPHONE_17_VIEWPORT.width,
      IPHONE_17_VIEWPORT.height,
      NOTCH_SAFE_AREA,
    );
    // 居中容差 ≤1px（整数像素舍入）
    expect(
      Math.abs(
        layout.walletRect.left + layout.walletRect.width / 2 - IPHONE_17_VIEWPORT.width / 2,
      ),
    ).toBeLessThanOrEqual(1);
    expect(layout.walletRect.top).toBeGreaterThan(IPHONE_17_VIEWPORT.height * 0.4);
    expect(layout.walletRect.top + layout.walletRect.height).toBeLessThanOrEqual(
      IPHONE_17_VIEWPORT.height - NOTCH_SAFE_AREA.bottom,
    );
    // 钱包占屏宽过半（画面主角，实测反馈：占比不能再小）
    expect(layout.walletRect.width).toBeGreaterThan(IPHONE_17_VIEWPORT.width * 0.5);
  });

  it('小屏机型（SE 尺寸）构图不裁切', () => {
    const layout = computeSceneLayout(375, 667, { top: 20, bottom: 0, left: 0, right: 0 });
    expect(layout.walletRect.top + layout.walletRect.height).toBeLessThanOrEqual(667);
    expect(layout.walletRect.width).toBeLessThanOrEqual(210);
  });

  it('钱包口热区位于折线附近（开启后纸币露出处）', () => {
    const layout = computeSceneLayout(402, 874, NOTCH_SAFE_AREA);
    expect(layout.walletMouthRect.top).toBeLessThanOrEqual(layout.walletFoldLineY);
    expect(layout.walletMouthRect.top + layout.walletMouthRect.height).toBeGreaterThan(
      layout.walletFoldLineY,
    );
  });
});

describe('背景色板漂移时序', () => {
  it('t=0 为第一组色板原色（驻留期不动）', () => {
    const startColorPair = interpolateSceneBackgroundColorAtElapsed(0);
    expect(startColorPair.topColorCss).toBe('rgb(247, 239, 228)');
    const holdColorPair = interpolateSceneBackgroundColorAtElapsed(100);
    expect(holdColorPair.topColorCss).toBe('rgb(247, 239, 228)');
  });

  it('交叉过渡中点为两组色板的中间值', () => {
    const crossfadeStart =
      BACKGROUND_DRIFT_PHASE_SECONDS - BACKGROUND_DRIFT_CROSSFADE_SECONDS;
    const midColorPair = interpolateSceneBackgroundColorAtElapsed(crossfadeStart + 15);
    expect(midColorPair.topColorCss).toBe('rgb(245, 240, 230)');
  });

  it('一个完整周期后回到起点（循环）', () => {
    const afterFullCycle = interpolateSceneBackgroundColorAtElapsed(
      BACKGROUND_DRIFT_PHASE_SECONDS * 3 + 1,
    );
    const atOneSecond = interpolateSceneBackgroundColorAtElapsed(1);
    expect(afterFullCycle.topColorCss).toBe(atOneSecond.topColorCss);
  });
});

describe('金额里程表货币符号绘制色（自持，不继承上游残留）', () => {
  interface RecordedTextCall {
    text: string;
    /** 该次 fillText 发生时刻的 fillStyle（捕获跨画师状态残留） */
    fillStyleAtCall: string;
  }

  // 录制型 mock：记录每次 fillText 调用时的 fillStyle（沿用 flap-seams.test.ts 惯例）
  function textCallRecordingContext(initialFillStyle: string) {
    const textCalls: RecordedTextCall[] = [];
    // fillStyle 用 getter/setter 镜像到局部变量，供 fillText 捕获调用时刻的值
    let currentFillStyle = initialFillStyle;
    const context = {
      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(value: string) {
        currentFillStyle = value;
      },
      textAlign: 'left',
      textBaseline: 'alphabetic',
      font: '',
      save() {},
      restore() {},
      translate() {},
      scale() {},
      measureText(text: string) {
        return { width: text.length * 10 };
      },
      fillText(text: string) {
        textCalls.push({ text, fillStyleAtCall: currentFillStyle });
      },
    } as unknown as CanvasRenderingContext2D;
    return { context, textCalls };
  }

  // 缺陷复现条件：里程表在 game.ts 中紧跟纸币画师绘制，上下文残留纸币浅色底色
  const BILL_BASE_COLOR_HEX = DENOMINATION_COLOR_MAP['denomination-100'].baseColorHex;

  it('货币符号与数字同以墨青色落笔（预置纸币底色残留仍可见）', () => {
    const recording = textCallRecordingContext(BILL_BASE_COLOR_HEX);
    paintAmountOdometer(recording.context, createAmountOdometerState(1240), {
      centerX: 320,
      topY: 80,
      fontSize: 48,
      milestoneFlashRatio: 0,
    });

    const symbolCall = recording.textCalls.find((call) => call.text === '$');
    expect(symbolCall).toBeDefined();
    // 货币符号必须是里程表自持的墨青色，而非上游残留的纸币底色（缺陷：浅色画浅色即隐形）
    expect(symbolCall?.fillStyleAtCall).toBe(INK_TEXT_COLOR_HEX);
    // 同一轮绘制内所有文本（符号/分隔符/数字）颜色一致，无取色分叉
    for (const call of recording.textCalls) {
      expect(call.fillStyleAtCall).toBe(INK_TEXT_COLOR_HEX);
    }
  });

  it('里程碑闪色时货币符号与数字同为墨青→蜜金混合色', () => {
    const recording = textCallRecordingContext(BILL_BASE_COLOR_HEX);
    paintAmountOdometer(recording.context, createAmountOdometerState(1245), {
      centerX: 320,
      topY: 80,
      fontSize: 48,
      milestoneFlashRatio: 0.6,
    });

    const expectedBlendColor = blendCssColor(INK_TEXT_COLOR_HEX, MILESTONE_FLASH_COLOR_HEX, 0.6);
    const symbolCall = recording.textCalls.find((call) => call.text === '$');
    expect(symbolCall?.fillStyleAtCall).toBe(expectedBlendColor);
    expect(symbolCall?.fillStyleAtCall).not.toBe(BILL_BASE_COLOR_HEX);
    for (const call of recording.textCalls) {
      expect(call.fillStyleAtCall).toBe(expectedBlendColor);
    }
  });
});
