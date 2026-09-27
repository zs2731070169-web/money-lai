import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import {
  createInitialPersistedGameState,
  serializePersistedGameState,
} from '../../src/core/meta/game-state';
import type { NormalizedTouchPoint, PlatformAdapter, TouchPhase } from '../../src/core/platform';

/**
 * 轻提示排队逐个显示（queue-floating-toasts）：
 * 多条提示同时触发时任一时刻只显示队首一条，前者淡出后后者接续上场。
 */

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };

function isToastText(text: string): boolean {
  return text.includes('解锁皮肤') || text.includes('成就达成');
}

function createToastQueueHarness() {
  const fillTexts: string[] = [];
  const listeners: Array<(phase: TouchPhase, point: NormalizedTouchPoint) => void> = [];
  let frameCallback: ((timestampMs: number) => void) | null = null;
  let clockMs = 0;
  // 预置状态：累计 99 张、无成就无皮肤解锁——下一次抽钞（第 100 张）同时触发
  // 皮肤解锁（bill-sage@100）与多个成就（first-draw + draw-count-100），制造多条并发提示
  const craftedState = {
    ...createInitialPersistedGameState(),
    lifetimeDrawCount: 99,
    unlockedSkins: ['wallet-classic'],
    achievements: [],
  };
  const persistedJson = serializePersistedGameState(craftedState);
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
    presentTextInput: () => Promise.resolve(null),
    triggerHapticImpact() {},
    readPersistentValue: () => persistedJson,
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
  return { game, touch, frames, fillTexts };
}

describe('轻提示排队逐个显示', () => {
  it('第 100 张抽钞同时触发多条提示：首屏只显示一条，全部依次出场', () => {
    const harness = createToastQueueHarness();

    // 开盖 → 抽一张（第 100 张：并发触发 1 皮肤 + 2 成就 = 3 条提示）
    harness.touch('start', 201, 437);
    harness.touch('move', 201, 407);
    harness.touch('end', 201, 407);
    harness.frames(120); // 开盖折叠 1680ms（daytime-comfort）
    harness.touch('start', 200, 612);
    harness.touch('move', 200, 552);
    harness.touch('move', 200, 392); // 累计 220px 行程：0.75 跟手增益下稳过完成阈值
    harness.touch('end', 200, 392);
    harness.frames(40);
    expect(harness.game.getSmokeTestSnapshot().persistedLifetimeDrawCount).toBe(100);

    // 首个提示在场窗口（提示在前面 40 帧内已开场，剩余寿命 < 2.5s；
    // 取 100 帧 = ~1.67s 的纯观察窗，队首不可能过期换场）：任一时刻只有一条
    harness.fillTexts.length = 0;
    harness.frames(100);
    const firstWindowToasts = new Set(harness.fillTexts.filter(isToastText));
    expect(firstWindowToasts.size).toBe(1);

    // 推进满四个周期：四条全部依次出场（累计唯一数 = 4：
    // caramel+sage 两个皮肤解锁 + first-draw + draw-count-100 两个成就）
    harness.frames(560);
    const allToasts = new Set(harness.fillTexts.filter(isToastText));
    expect(allToasts.size).toBe(4);
  });
});
