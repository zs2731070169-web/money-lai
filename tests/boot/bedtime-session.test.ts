import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import type {
  NormalizedTouchPoint,
  PlatformAdapter,
  TouchPhase,
} from '../../src/core/platform';
import { computeSceneLayout } from '../../src/core/render/scene-layout';
import { computeOverlayLayout } from '../../src/core/meta/overlay-layout';
import {
  PERSISTED_STATE_STORAGE_KEY,
  PersistedGameStateV1,
  parsePersistedGameState,
} from '../../src/core/meta/game-state';

/**
 * 晚安会话无头集成冒烟（sleep-mode 规格，任务 5.1-5.3/4.5）：
 * 设置开关进入/退出、里程表延续与判定照常、熄灭弧线封存、早安卡一次性呈现。
 */

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };
const SCENE_LAYOUT = computeSceneLayout(VIEWPORT.width, VIEWPORT.height, SAFE_AREA);

/** Proxy 吸收一切节点调用的假音频上下文（离线语义可用） */
function createPermissiveAudioContext(): AudioContext {
  const absorbRecursive: unknown = new Proxy(function absorb() {}, {
    get: () => absorbRecursive,
    apply: () => absorbRecursive,
  });
  void absorbRecursive;
  return new Proxy(
    { currentTime: 0, sampleRate: 44100, state: 'running' },
    {
      get(target, property) {
        if (property in target) return (target as Record<string | symbol, unknown>)[property];
        return absorbRecursive;
      },
      set() {
        return true;
      },
    },
  ) as unknown as AudioContext;
}

function createBedtimeHarness(persistedJsonOnBoot: string | null) {
  const touchListeners: Array<(phase: TouchPhase, point: NormalizedTouchPoint) => void> = [];
  const visibilityListeners: Array<(visible: boolean) => void> = [];
  let frameCallback: ((timestampMs: number) => void) | null = null;
  let clockMs = 0;
  const hapticCalls: string[] = [];
  const persistedStore = new Map<string, string>(persistedJsonOnBoot
    ? [[PERSISTED_STATE_STORAGE_KEY, persistedJsonOnBoot]]
    : []);
  const gradient = { addColorStop() {} };
  const renderingContext = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'createLinearGradient') return () => gradient;
        if (property === 'measureText') return () => ({ width: 12 });
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
      touchListeners.push(listener);
    },
    createAudioContext: () => createPermissiveAudioContext(),
    onAudioInterruption() {},
    triggerHapticImpact(level) {
      hapticCalls.push(level);
    },
    readPersistentValue: (key) => persistedStore.get(key) ?? null,
    writePersistentValue: (key, value) => {
      persistedStore.set(key, value);
    },
    getSafeAreaInsets: () => SAFE_AREA,
    getLogicalViewportSize: () => VIEWPORT,
    onAppVisibilityChange(listener) {
      visibilityListeners.push(listener);
    },
    prefersReducedMotion: () => false,
    nowMilliseconds: () => clockMs,
    createOffscreenCanvas: () => null,
  };
  const game = new Game({ platformAdapter: adapter });
  game.start();
  const touch = (phase: TouchPhase, x: number, y: number) => {
    for (const listener of touchListeners) {
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
  /** 直接推进物理时钟（不走帧循环，模拟长时静置/锁屏） */
  const advanceClockBy = (deltaMs: number) => {
    clockMs += deltaMs;
  };
  const makeVisible = (visible: boolean) => {
    for (const listener of visibilityListeners) listener(visible);
  };
  return { game, touch, frames, advanceClockBy, makeVisible, hapticCalls, persistedStore };
}

/** 上滑开盖 + 从钱包口抽一张纸币（完成抽出） */
function drawOneBill(
  harness: ReturnType<typeof createBedtimeHarness>,
): void {
  const walletCenterX = SCENE_LAYOUT.walletRect.left + SCENE_LAYOUT.walletRect.width / 2;
  const flapPressY = SCENE_LAYOUT.walletRect.top + 40;
  // 上滑开盖（滑动即信号：累计 28px 触发）；夜间剖面 1.68s，帧数覆盖最长剖面
  harness.touch('start', walletCenterX, flapPressY);
  harness.touch('move', walletCenterX, flapPressY - 16);
  harness.touch('move', walletCenterX, flapPressY - 32);
  harness.touch('end', walletCenterX, flapPressY - 32);
  harness.frames(140); // 折叠完成进入开启稳态（140 帧 ≈ 2.33s > 夜间 1.68s）
  // 抓取堆顶纸币向上拖出（对齐 tap-routing 的成功姿势：露出纸币顶部起手、单段大幅上拖；
  // 夜间 0.75 跟手增益下行程同样充分）
  const billGrabY = SCENE_LAYOUT.walletFoldLineY - 23;
  harness.touch('start', walletCenterX, billGrabY);
  // 220px 行程：夜间 0.75 跟手增益下抽出比例 ≈0.47，稳过 0.35 完成阈值
  harness.touch('move', walletCenterX, billGrabY - 220);
  harness.touch('end', walletCenterX, billGrabY - 220);
  harness.frames(60); // 完成动画 + 结算
}

/** 经设置页切换晚安模式（抽屉路由全链路） */
function toggleBedtimeViaSettings(
  harness: ReturnType<typeof createBedtimeHarness>,
): void {
  const metaLayout = computeSceneLayout(VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
  harness.touch('start', metaLayout.metaEntryAnchor.centerX, metaLayout.metaEntryAnchor.centerY);
  harness.touch('end', metaLayout.metaEntryAnchor.centerX, metaLayout.metaEntryAnchor.centerY);
  harness.frames(30); // 抽屉滑入完成（命中防护要求完全展开）
  const menuLayout = computeOverlayLayout('menu', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
  const settingsButton = menuLayout.buttons.find((button) => button.action === 'menu-settings');
  if (!settingsButton) throw new Error('菜单缺设置条目');
  harness.touch('start', settingsButton.hitRect.left + 10, settingsButton.hitRect.top + 10);
  harness.touch('end', settingsButton.hitRect.left + 10, settingsButton.hitRect.top + 10);
  harness.frames(2);
  const settingsLayout = computeOverlayLayout('settings', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
  const bedtimeButton = settingsLayout.buttons.find(
    (button) => button.action === 'toggle-bedtime-mode',
  );
  if (!bedtimeButton) throw new Error('设置页晚安模式开关行');
  harness.touch('start', bedtimeButton.hitRect.left + 10, bedtimeButton.hitRect.top + 10);
  harness.touch('end', bedtimeButton.hitRect.left + 10, bedtimeButton.hitRect.top + 10);
  harness.frames(2);
  // 关闭抽屉回主画面
  const closeButton = settingsLayout.buttons.find((button) => button.action === 'close');
  if (closeButton) {
    harness.touch('start', closeButton.hitRect.left + 10, closeButton.hitRect.top + 10);
    harness.touch('end', closeButton.hitRect.left + 10, closeButton.hitRect.top + 10);
    harness.frames(30);
  }
}

describe('晚安会话集成（默认夜间 + 设置开关 + 抽钞 + 熄灭封存 + 早安卡）', () => {
  it('新装默认夜间剖面：抽钞判定照常、触觉降为最轻档、里程表延续', () => {
    const harness = createBedtimeHarness(null);
    harness.frames(2);
    // bedtime-default-on：新装冷启动即夜间剖面（无需任何开关操作）
    const enteredSnapshot = harness.game.getSmokeTestSnapshot();
    expect(enteredSnapshot.bedtimeSessionActive).toBe(true);
    expect(enteredSnapshot.sleepArcPhase).toBe('idle');

    drawOneBill(harness);
    const drawnSnapshot = harness.game.getSmokeTestSnapshot();
    expect(drawnSnapshot.sessionCount).toBe(1);
    expect(drawnSnapshot.persistedLifetimeDrawCount).toBe(1);
    // 夜间触觉降档：全程只出现最轻档（sleep-mode「夜间交互剖面」）
    expect(harness.hapticCalls.every((level) => level === 'light')).toBe(true);
  });

  it('退出晚安会话：主动退出封存一条无入睡点记录、不触发早安卡', () => {
    const harness = createBedtimeHarness(null);
    harness.frames(2);
    drawOneBill(harness);
    toggleBedtimeViaSettings(harness); // 默认开启下首次切换 = 关闭
    const snapshot = harness.game.getSmokeTestSnapshot();
    expect(snapshot.bedtimeSessionActive).toBe(false);
    expect(snapshot.sleepLedgerNightCount).toBe(1);
    expect(snapshot.morningCardPending).toBe(false); // 主动退出不触发
  });

  it('熄灭弧线：静置跨阈值封存、触摸温和恢复不退出、同夜不重复封存', () => {
    const harness = createBedtimeHarness(null);
    harness.frames(2);
    drawOneBill(harness);
    // 静置跨过 90s 阈值 → 渐暗；跨过 150s → 近黑 + 入睡点封存（帧循环按单调时钟补判）
    harness.advanceClockBy(95_000);
    harness.frames(2);
    expect(harness.game.getSmokeTestSnapshot().sleepArcPhase).toBe('dimming');
    harness.advanceClockBy(60_000);
    harness.frames(2);
    const sealedSnapshot = harness.game.getSmokeTestSnapshot();
    expect(sealedSnapshot.sleepArcPhase).toBe('dimmed');
    expect(sealedSnapshot.sleepLedgerNightCount).toBe(1);
    expect(sealedSnapshot.morningCardPending).toBe(true);
    expect(sealedSnapshot.morningCardVisible).toBe(false); // 冷启动内不立即弹，待下次冷启/回前台

    // 熄灭后触摸：恢复 idle、仍处于晚安会话、封存不重复
    harness.touch('start', 201, 500);
    harness.touch('end', 201, 500);
    harness.frames(2);
    const wokenSnapshot = harness.game.getSmokeTestSnapshot();
    expect(wokenSnapshot.sleepArcPhase).toBe('idle');
    expect(wokenSnapshot.bedtimeSessionActive).toBe(true);
    expect(wokenSnapshot.sleepLedgerNightCount).toBe(1);
  });

  it('早安卡：封存后的回前台一次性呈现，点「开始新的一天」关闭且不再呈现', () => {
    const harness = createBedtimeHarness(null);
    harness.frames(2);
    drawOneBill(harness);
    harness.advanceClockBy(160_000);
    harness.frames(2);
    expect(harness.game.getSmokeTestSnapshot().morningCardPending).toBe(true);
    // 回前台 → 呈现
    harness.makeVisible(false);
    harness.makeVisible(true);
    expect(harness.game.getSmokeTestSnapshot().morningCardVisible).toBe(true);
    // 点「开始新的一天」（关闭按钮居中）
    const cardCenterX = VIEWPORT.width / 2;
    const cardTop = VIEWPORT.height * 0.3;
    harness.touch('start', cardCenterX, cardTop + 204 - 60 + 22);
    harness.touch('end', cardCenterX, cardTop + 204 - 60 + 22);
    const dismissedSnapshot = harness.game.getSmokeTestSnapshot();
    expect(dismissedSnapshot.morningCardVisible).toBe(false);
    expect(dismissedSnapshot.morningCardPending).toBe(false);
    // 再次回前台不重复呈现
    harness.makeVisible(false);
    harness.makeVisible(true);
    expect(harness.game.getSmokeTestSnapshot().morningCardVisible).toBe(false);
  });

  it('封存数据持久化：新冷启动从存档恢复账本并保持晚安开关状态', () => {
    const firstHarness = createBedtimeHarness(null);
    firstHarness.frames(2);
    drawOneBill(firstHarness);
    firstHarness.advanceClockBy(160_000);
    firstHarness.frames(2);
    const persistedJson = firstHarness.persistedStore.get(PERSISTED_STATE_STORAGE_KEY) ?? null;
    expect(persistedJson).not.toBeNull();
    const parsedState: PersistedGameStateV1 = parsePersistedGameState(persistedJson).state;
    expect((parsedState.sleepLedger ?? []).length).toBe(1);
    expect(parsedState.settings.bedtimeModeEnabled).toBe(true);

    // 第二次冷启动：开关保持 → 夜间剖面；早安卡待呈现 → 呈现
    const secondHarness = createBedtimeHarness(persistedJson);
    secondHarness.frames(2);
    const snapshot = secondHarness.game.getSmokeTestSnapshot();
    expect(snapshot.bedtimeSessionActive).toBe(true);
    expect(snapshot.sleepLedgerNightCount).toBe(1);
    expect(snapshot.morningCardVisible).toBe(true);
  });

  it('用户显式关闭：冷启动保持关闭（默认开启不覆盖用户选择）', () => {
    const firstHarness = createBedtimeHarness(null);
    firstHarness.frames(2);
    toggleBedtimeViaSettings(firstHarness); // 默认开启 → 关闭
    expect(firstHarness.game.getSmokeTestSnapshot().bedtimeSessionActive).toBe(false);
    const persistedJson = firstHarness.persistedStore.get(PERSISTED_STATE_STORAGE_KEY) ?? null;
    expect(parsePersistedGameState(persistedJson).state.settings.bedtimeModeEnabled).toBe(false);

    const secondHarness = createBedtimeHarness(persistedJson);
    secondHarness.frames(2);
    expect(secondHarness.game.getSmokeTestSnapshot().bedtimeSessionActive).toBe(false);
  });
});
