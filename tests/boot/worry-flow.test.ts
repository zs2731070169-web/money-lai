import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import type {
  NormalizedTouchPoint,
  PlatformAdapter,
  TouchPhase,
} from '../../src/core/platform';
import { computeSceneLayout } from '../../src/core/render/scene-layout';

/**
 * 心事升腾无头集成冒烟（worry-release 规格，任务 5.1-5.4）：
 * 长按写下 → 心事钞抽出（计张不计额/元进程无感）→ 普通抽钞 → 放飞归零 → 取消 → 续抽。
 */

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };
const SCENE_LAYOUT = computeSceneLayout(VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
const WALLET_CENTER_X = SCENE_LAYOUT.walletRect.left + SCENE_LAYOUT.walletRect.width / 2;

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

/** 假心事输入：每次调用返回注入文本（或 null=取消） */
function createWorryHarness(inputText: string | null) {
  const touchListeners: Array<(phase: TouchPhase, point: NormalizedTouchPoint) => void> = [];
  let frameCallback: ((timestampMs: number) => void) | null = null;
  let clockMs = 0;
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
    triggerHapticImpact() {},
    readPersistentValue: () => null,
    writePersistentValue() {},
    getSafeAreaInsets: () => SAFE_AREA,
    getLogicalViewportSize: () => VIEWPORT,
    onAppVisibilityChange() {},
    prefersReducedMotion: () => false,
    nowMilliseconds: () => clockMs,
    createOffscreenCanvas: () => null,
    presentTextInput: () => Promise.resolve(inputText),
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
  return { game, touch, frames };
}

/** 上滑开盖并等待开启稳态 */
function openWallet(harness: ReturnType<typeof createWorryHarness>): void {
  const flapPressY = SCENE_LAYOUT.walletRect.top + 40;
  harness.touch('start', WALLET_CENTER_X, flapPressY);
  harness.touch('move', WALLET_CENTER_X, flapPressY - 16);
  harness.touch('move', WALLET_CENTER_X, flapPressY - 32);
  harness.touch('end', WALLET_CENTER_X, flapPressY - 32);
  harness.frames(140);
}

/** 从钱包口抽一张纸币（220px 行程：351px 归一高度 + daytime-comfort 拖拽增益后比例 ≈0.47，稳过 0.35 完成阈值） */
function drawOneBill(harness: ReturnType<typeof createWorryHarness>): void {
  const mouthY = SCENE_LAYOUT.walletFoldLineY - 23;
  harness.touch('start', WALLET_CENTER_X, mouthY);
  harness.touch('move', WALLET_CENTER_X, mouthY - 220);
  harness.touch('end', WALLET_CENTER_X, mouthY - 220);
  harness.frames(50);
}

/** 等待心事输入 Promise 链落定 */
async function settleWorryInput() {
  for (let tick = 0; tick < 5; tick += 1) {
    await Promise.resolve();
  }
}

describe('心事升腾全链路', () => {
  it('长按纸堆唤输入 → 写下置位心事钞；取消输入无痕', async () => {
    const harness = createWorryHarness('房贷');
    harness.frames(2);
    openWallet(harness);
    // 长按纸堆（按住不动 ~0.6s）
    const mouthY = SCENE_LAYOUT.walletFoldLineY - 23;
    harness.touch('start', WALLET_CENTER_X, mouthY);
    harness.frames(36);
    await settleWorryInput();
    expect(harness.game.getSmokeTestSnapshot().pendingWorryBillActive).toBe(true);
    harness.touch('end', WALLET_CENTER_X, mouthY);

    // 取消路径：新的长按输入返回 null → 无置位
    const cancelHarness = createWorryHarness(null);
    cancelHarness.frames(2);
    openWallet(cancelHarness);
    cancelHarness.touch('start', WALLET_CENTER_X, mouthY);
    cancelHarness.frames(36);
    await settleWorryInput();
    expect(cancelHarness.game.getSmokeTestSnapshot().pendingWorryBillActive).toBe(false);
  });

  it('心事钞抽出：计张不计额、里程表不动、元进程无感、转入在场清单', async () => {
    const harness = createWorryHarness('周一汇报');
    harness.frames(2);
    openWallet(harness);
    const mouthY = SCENE_LAYOUT.walletFoldLineY - 23;
    harness.touch('start', WALLET_CENTER_X, mouthY);
    harness.frames(36);
    await settleWorryInput();
    harness.touch('end', WALLET_CENTER_X, mouthY);
    harness.frames(2);

    drawOneBill(harness);
    const snapshot = harness.game.getSmokeTestSnapshot();
    expect(snapshot.sessionCount).toBe(1);
    expect(snapshot.sessionAmount).toBe(0);
    expect(snapshot.odometerTargetTotal).toBe(0);
    expect(snapshot.persistedLifetimeDrawCount).toBe(0); // 元进程无感
    expect(snapshot.carriedWorryBillCount).toBe(1);
  });

  it('放飞：凝沓跟手 → 高处松手 → 升腾归零、心事清空、可继续抽钞', async () => {
    const harness = createWorryHarness('房贷');
    harness.frames(2);
    openWallet(harness);
    const mouthY = SCENE_LAYOUT.walletFoldLineY - 23;
    harness.touch('start', WALLET_CENTER_X, mouthY);
    harness.frames(36);
    await settleWorryInput();
    harness.touch('end', WALLET_CENTER_X, mouthY);
    drawOneBill(harness); // 心事钞（¥0）
    drawOneBill(harness); // 普通钞（金额 > 0，解锁放飞前置）
    const beforeScatter = harness.game.getSmokeTestSnapshot();
    expect(beforeScatter.sessionAmount).toBeGreaterThan(0);
    expect(beforeScatter.carriedWorryBillCount).toBe(1);

    // 按住里程表凝沓 → 上拖 → 松手放飞
    const odometerX = SCENE_LAYOUT.odometerAnchor.centerX;
    const odometerY = SCENE_LAYOUT.odometerAnchor.topY + 30;
    harness.touch('start', odometerX, odometerY);
    expect(harness.game.getSmokeTestSnapshot().scatterPhase).toBe('grasped');
    harness.touch('move', odometerX, odometerY - 30);
    harness.touch('move', odometerX, odometerY - 70);
    harness.touch('end', odometerX, odometerY - 70);
    harness.frames(10);
    const scattered = harness.game.getSmokeTestSnapshot();
    expect(scattered.scatterPhase).toBe('idle');
    expect(scattered.sessionAmount).toBe(0);
    expect(scattered.sessionCount).toBe(0);
    expect(scattered.odometerTargetTotal).toBe(0);
    expect(scattered.carriedWorryBillCount).toBe(0);

    // 续抽：归零后可继续（普通钞）
    drawOneBill(harness);
    const resumed = harness.game.getSmokeTestSnapshot();
    expect(resumed.sessionCount).toBe(1);
    expect(resumed.sessionAmount).toBeGreaterThan(0);
  });

  it('取消：原位松手数字恢复、状态无变化；空余额按住里程表不凝沓', async () => {
    const harness = createWorryHarness('房贷');
    harness.frames(2);
    openWallet(harness);
    drawOneBill(harness);
    const beforeSnapshot = harness.game.getSmokeTestSnapshot();
    expect(beforeSnapshot.sessionAmount).toBeGreaterThan(0);

    const odometerX = SCENE_LAYOUT.odometerAnchor.centerX;
    const odometerY = SCENE_LAYOUT.odometerAnchor.topY + 30;
    // 原位松手：取消回落
    harness.touch('start', odometerX, odometerY);
    harness.touch('move', odometerX, odometerY - 10);
    harness.touch('end', odometerX, odometerY - 10);
    const cancelled = harness.game.getSmokeTestSnapshot();
    expect(cancelled.scatterPhase).toBe('idle');
    expect(cancelled.sessionAmount).toBe(beforeSnapshot.sessionAmount);

    // 里程表下方点按不触发凝沓（命中区外）
    harness.touch('start', odometerX, odometerY + 160);
    expect(harness.game.getSmokeTestSnapshot().scatterPhase).toBe('idle');
    harness.touch('end', odometerX, odometerY + 160);

    // 放飞归零后（空余额）按住里程表：静默无动作
    harness.touch('start', odometerX, odometerY);
    harness.touch('move', odometerX, odometerY - 70);
    harness.touch('end', odometerX, odometerY - 70); // 先放飞
    harness.frames(10);
    harness.touch('start', odometerX, odometerY);
    expect(harness.game.getSmokeTestSnapshot().scatterPhase).toBe('idle'); // 余额 0 不凝沓
    harness.touch('end', odometerX, odometerY);
  });
});
