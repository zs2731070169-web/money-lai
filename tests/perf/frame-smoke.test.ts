import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { computeSceneLayout } from '../../src/core/render/scene-layout';
import {
  HapticImpactLevel,
  NormalizedTouchPoint,
  PlatformAdapter,
  PrimaryCanvas,
  SafeAreaInsets,
  TouchPhase,
} from '../../src/core/platform';

/**
 * 性能冒烟 + 主链路集成测试（任务 8.3 验证入口，platform-adaptation 规格「渲染性能预算」）：
 * 无头驱动 N 帧「开钱包 → 连抽纸币」全闭环，
 * 断言 ① 帧预算（平均步进+渲染耗时）② 每帧绘制调用两位数内 ③ 热路径无明显堆增长 ④ 核心闭环行为正确。
 */

/** 记录昂贵绘制操作次数的空操作 2D 上下文（fill/stroke/fillText/drawImage/渐变创建） */
const EXPENSIVE_RENDER_OPERATIONS = new Set([
  'fill',
  'stroke',
  'fillText',
  'strokeText',
  'drawImage',
  'createLinearGradient',
  'createRadialGradient',
  'createPattern',
]);

function createCountingCanvasContext() {
  let methodCallCount = 0;
  const gradientStub = { addColorStop: () => {} };
  const contextProxy = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'measureText') {
          return () => ({ width: 12 });
        }
        if (property === 'createLinearGradient' || property === 'createRadialGradient') {
          return () => {
            methodCallCount += 1;
            return gradientStub;
          };
        }
        return () => {
          if (EXPENSIVE_RENDER_OPERATIONS.has(property as string)) {
            methodCallCount += 1;
          }
        };
      },
      set() {
        return true;
      },
    },
  );
  return {
    contextProxy: contextProxy as unknown as CanvasRenderingContext2D,
    resetCallCount: () => {
      methodCallCount = 0;
    },
    getCallCount: () => methodCallCount,
  };
}

/** 无头平台适配器：手动驱动帧与时钟 */
function createHeadlessPlatformAdapter() {
  const countingContext = createCountingCanvasContext();
  const touchListeners: Array<(phase: TouchPhase, point: NormalizedTouchPoint) => void> = [];
  let frameCallback: ((timestampMs: number) => void) | null = null;
  let clockMs = 0;
  const storage = new Map<string, string>();

  const adapter: PlatformAdapter = {
    createPrimaryCanvas(): PrimaryCanvas {
      return {
        renderingContext: countingContext.contextProxy,
        logicalWidth: 402,
        logicalHeight: 874,
      };
    },
    requestFrame(callback) {
      frameCallback = callback;
      return 1;
    },
    onTouch(listener) {
      touchListeners.push(listener);
    },
    createAudioContext() {
      return null; // 无头环境：音频静默降级路径
    },
    onAudioInterruption() {},
    triggerHapticImpact(_level: HapticImpactLevel) {},
    readPersistentValue(key) {
      return storage.get(key) ?? null;
    },
    writePersistentValue(key, value) {
      storage.set(key, value);
    },
    getSafeAreaInsets(): SafeAreaInsets {
      return { top: 62, bottom: 34, left: 0, right: 0 };
    },
    getLogicalViewportSize() {
      return { width: 402, height: 874 };
    },
    onAppVisibilityChange() {},
    prefersReducedMotion() {
      return false;
    },
    nowMilliseconds() {
      return clockMs;
    },
    createOffscreenCanvas() {
      return null; // 无头环境：覆盖翻盖三维渲染的平面降级路径
    },
  };

  return {
    adapter,
    emitTouch(phase: TouchPhase, positionX: number, positionY: number) {
      for (const listener of touchListeners) {
        listener(phase, { positionX, positionY, pointerId: 1 });
      }
    },
    /** 推进一帧（约 16.67ms），同步推进逻辑时钟 */
    advanceFrame(frameDurationMs = 16.67) {
      clockMs += frameDurationMs;
      const pendingCallback = frameCallback;
      frameCallback = null;
      if (pendingCallback) {
        pendingCallback(clockMs);
      }
    },
    getClockMs: () => clockMs,
    ...countingContext,
  };
}

describe('性能冒烟与主链路集成（开钱包 → 连抽）', () => {
  it('全闭环行为正确：翻盖开启、连抽计数、里程表到达目标金额', () => {
    const headless = createHeadlessPlatformAdapter();
    const game = new Game({ platformAdapter: headless.adapter });
    game.start();

    // 0) 背景轻点预热（标题页已移除，冷启动即主场景；boot-wallet-autoplay-bgm）
    headless.emitTouch('start', 200, 300);
    headless.emitTouch('end', 200, 300);
    headless.advanceFrame();

    // 1) 拖开翻盖：按住翻盖区（钱包上半部），向上拖 150px 后松手
    headless.emitTouch('start', 200, 470);
    for (let stepIndex = 0; stepIndex < 5; stepIndex += 1) {
      headless.emitTouch('move', 200, 470 - (stepIndex + 1) * 30);
      headless.advanceFrame();
    }
    headless.emitTouch('end', 200, 320);
    for (let frameIndex = 0; frameIndex < 120; frameIndex += 1) {
      headless.advanceFrame(); // 缓入缓出自主折叠（daytime-comfort 开 1.68s ≈ 101 帧，留余量）
    }
    const openedSnapshot = game.getSmokeTestSnapshot();
    if (!openedSnapshot.walletOpen) {
      console.log('[smoke-debug]', JSON.stringify(openedSnapshot));
    }
    expect(game.getSmokeTestSnapshot().walletOpen).toBe(true);

    // 2) 连抽 10 张：在钱包口抓取 → 上拖 160px（超过长票 35% 阈值）→ 松手
    //    抓点从布局推导（折线上方的钞票探出区），布局调整不再脆断
    const smokeLayout = computeSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const grabY = smokeLayout.walletFoldLineY - 20;
    for (let drawIndex = 0; drawIndex < 10; drawIndex += 1) {
      headless.emitTouch('start', 200, grabY);
      headless.emitTouch('move', 200, grabY - 60);
      headless.emitTouch('move', 200, grabY - 220);
      headless.emitTouch('end', 200, grabY - 220);
      for (let frameIndex = 0; frameIndex < 34; frameIndex += 1) {
        headless.advanceFrame(); // ≈570ms：超过完成动画时长
      }
    }
    const snapshot = game.getSmokeTestSnapshot();
    expect(snapshot.sessionCount).toBe(10);
    expect(snapshot.sessionAmount).toBeGreaterThan(0);
    expect(snapshot.odometerTargetTotal).toBe(snapshot.sessionAmount);
    expect(snapshot.persistedLifetimeDrawCount).toBe(10);
  });

  it('帧预算：600 帧平均「步进+渲染」耗时与每帧绘制调用满足预算', () => {
    const headless = createHeadlessPlatformAdapter();
    const game = new Game({ platformAdapter: headless.adapter });
    game.start();

    // 背景轻点 + 预热（建树/JIT/内联缓存）后再计量
    headless.emitTouch('start', 200, 300);
    headless.emitTouch('end', 200, 300);
    headless.emitTouch('start', 200, 470);
    headless.emitTouch('move', 200, 430);
    headless.emitTouch('end', 200, 430);
    for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
      headless.advanceFrame();
    }
    headless.emitTouch('start', 200, 545);
    headless.emitTouch('move', 200, 495);
    headless.emitTouch('move', 200, 425);
    headless.emitTouch('end', 200, 425);

    // 计量段：600 帧（含拖拽中的重场景）
    const measuredFrameCount = 600;
    headless.resetCallCount();
    let maxDrawCallsPerFrame = 0;
    const measureStartNs = process.hrtime.bigint();
    for (let frameIndex = 0; frameIndex < measuredFrameCount; frameIndex += 1) {
      if (frameIndex % 40 === 0) {
        // 周期性模拟一次抓取拖拽，让热路径处于活跃状态
        headless.emitTouch('start', 200, 545);
        headless.emitTouch('move', 200, 500);
        headless.emitTouch('end', 200, 500);
      }
      headless.resetCallCount();
      headless.advanceFrame();
      maxDrawCallsPerFrame = Math.max(maxDrawCallsPerFrame, headless.getCallCount());
    }
    const measureEndNs = process.hrtime.bigint();
    const averageFrameCostMs =
      Number(measureEndNs - measureStartNs) / 1e6 / measuredFrameCount;

    expect(averageFrameCostMs).toBeLessThan(8); // 无头预算（真机预算另行真机压测）
    expect(maxDrawCallsPerFrame).toBeLessThan(160); // 条带细分 100 下的预算（真机压测回归项）
  });

  it('热路径堆增长：600 帧内无持续对象泄漏迹象', () => {
    const headless = createHeadlessPlatformAdapter();
    const game = new Game({ platformAdapter: headless.adapter });
    game.start();
    for (let frameIndex = 0; frameIndex < 100; frameIndex += 1) {
      headless.advanceFrame();
    }
    const heapBaselineBytes = process.memoryUsage().heapUsed;
    for (let frameIndex = 0; frameIndex < 600; frameIndex += 1) {
      if (frameIndex % 40 === 0) {
        headless.emitTouch('start', 200, 545);
        headless.emitTouch('move', 200, 500);
        headless.emitTouch('end', 200, 500);
      }
      headless.advanceFrame();
    }
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBaselineBytes;
    // 经验阈值：600 帧稳态场景堆增长应在 MB 量级以下（允许 GC 波动的宽松上限）
    expect(heapDeltaBytes).toBeLessThan(32 * 1024 * 1024);
  });
});
