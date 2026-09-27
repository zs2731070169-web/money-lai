import { describe, expect, it } from 'vitest';
import { DAYTIME_BOOT_PERSISTED_JSON } from '../support/daytime-boot-state';
import { Game } from '../../src/core/game';
import { billRectAtDrawRatio } from '../../src/core/render/bill-geometry';
import { computeSceneLayout } from '../../src/core/render/scene-layout';
import { computeOverlayLayout } from '../../src/core/meta/overlay-layout';
import type { NormalizedTouchPoint, PlatformAdapter, TouchPhase } from '../../src/core/platform';

/**
 * 轻提示不压抽屉（meta-side-drawer 实测反馈追加）：
 * 解锁皮肤/成就的自动淡出轻提示在抽屉打开期间不得绘制；抽屉关闭后未过期的继续淡出。
 */

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };
const layout = computeSceneLayout(VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
const drawerLayout = computeOverlayLayout('menu', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);

function createToastRecordingHarness() {
  const fillTexts: string[] = [];
  const listeners: Array<(phase: TouchPhase, point: NormalizedTouchPoint) => void> = [];
  let frameCallback: ((timestampMs: number) => void) | null = null;
  let clockMs = 0;
  const gradient = { addColorStop() {} };
  const renderingContext = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'createLinearGradient') return () => gradient;
        if (property === 'measureText') return () => ({ width: 12 });
        if (property === 'fillText') return (text: string) => { fillTexts.push(String(text)); };
        return () => {};
      },
      set() {
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const adapter: PlatformAdapter = {
    createPrimaryCanvas: () => ({
      renderingContext,
      logicalWidth: VIEWPORT.width,
      logicalHeight: VIEWPORT.height,
    }),
    requestFrame(callback) {
      frameCallback = callback;
      return 1;
    },
    onTouch(listener) {
      listeners.push(listener);
    },
    createAudioContext: () => null,
    onAudioInterruption() {},
    triggerHapticImpact() {},
    readPersistentValue: () => DAYTIME_BOOT_PERSISTED_JSON,
    writePersistentValue() {},
    getSafeAreaInsets: () => SAFE_AREA,
    getLogicalViewportSize: () => VIEWPORT,
    onAppVisibilityChange() {},
    prefersReducedMotion: () => false,
    nowMilliseconds: () => clockMs,
    createOffscreenCanvas: () => null,
  };
  const game = new Game({ platformAdapter: adapter });
  game.start();
  const touch = (phase: TouchPhase, x: number, y: number) => {
    for (const listener of listeners) {
      listener(phase, { positionX: x, positionY: y, pointerId: 1 });
    }
  };
  const frames = (count: number) => {
    for (let index = 0; index < count; index += 1) {
      clockMs += 16.67;
      const callback = frameCallback;
      frameCallback = null;
      callback?.(clockMs);
    }
  };
  const tap = (x: number, y: number) => {
    touch('start', x, y);
    touch('end', x, y);
  };
  return { game, touch, tap, frames, fillTexts };
}

describe('轻提示不压抽屉', () => {
  it('抽屉打开期间不绘制解锁/成就轻提示，关闭后未过期的继续淡出', () => {
    const harness = createToastRecordingHarness();

    // 开盖 → 抽一张（触发「第一张来钱」成就轻提示）
    harness.touch('start', 200, layout.walletRect.top + 50);
    harness.touch('move', 200, layout.walletRect.top + 20);
    harness.touch('end', 200, layout.walletRect.top + 20);
    harness.frames(75);
    const visibleBill = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0);
    const billX = visibleBill.left + visibleBill.width / 2;
    const billY = visibleBill.top + 12;
    harness.touch('start', billX, billY);
    harness.touch('move', billX, billY - 160);
    harness.touch('end', billX, billY - 160);
    harness.frames(40);
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(1);

    // 前置：主画面下轻提示确实在画
    harness.fillTexts.length = 0;
    harness.frames(2);
    expect(harness.fillTexts.some((text) => text.includes('成就达成'))).toBe(true);

    // 打开抽屉（含滑入动画全程）：轻提示不得绘制
    harness.fillTexts.length = 0;
    harness.tap(layout.metaEntryAnchor.centerX, layout.metaEntryAnchor.centerY);
    harness.frames(16);
    expect(harness.game.getSmokeTestSnapshot().drawerOpen).toBe(true);
    expect(harness.fillTexts.some((text) => text.includes('成就达成'))).toBe(false);

    // 关闭抽屉：未过期（<2500ms）的轻提示恢复绘制
    harness.fillTexts.length = 0;
    const closeButton = drawerLayout.buttons.find((button) => button.action === 'close');
    if (!closeButton) throw new Error('关闭钮缺失');
    harness.tap(
      closeButton.hitRect.left + closeButton.hitRect.width / 2,
      closeButton.hitRect.top + closeButton.hitRect.height / 2,
    );
    harness.frames(14);
    expect(harness.game.getSmokeTestSnapshot().drawerOpen).toBe(false);
    expect(harness.fillTexts.some((text) => text.includes('成就达成'))).toBe(true);
  });
});
