import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import type {
  NormalizedTouchPoint,
  PlatformAdapter,
  TouchPhase,
} from '../../src/core/platform';

/**
 * 冷启动行为（boot-wallet-autoplay-bgm）：
 * 直入钱包主场景（无标题页转场）+ BGM 冷启动自动起播；
 * 平台要求手势时降级为「首触解锁后起播」。
 */

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };

/** Proxy 吸收一切节点调用的假音频上下文：startRendering 存在 → 视为可用（离线语义） */
function createPermissiveAudioContext(): AudioContext {
  const contextProxy = new Proxy(
    { currentTime: 0, sampleRate: 44100, state: 'running' },
    {
      get(target, property) {
        if (property in target) return (target as Record<string | symbol, unknown>)[property];
        // 任意方法都返回可继续链式取值/调用的吸收体
        return new Proxy(function absorb() {}, {
          get: () => absorbRecursive,
          apply: () => absorbRecursive,
        });
      },
      set() {
        return true;
      },
    },
  );
  const absorbRecursive: unknown = new Proxy(function absorb() {}, {
    get: () => absorbRecursive,
    apply: () => absorbRecursive,
  });
  void absorbRecursive;
  return contextProxy as unknown as AudioContext;
}

/** resume 恒定失败的上下文：模拟平台要求用户手势（state 挂起且 resume 拒绝） */
function createGestureRequiredAudioContext(): AudioContext {
  const permissive = createPermissiveAudioContext();
  return new Proxy(permissive, {
    get(target, property) {
      if (property === 'startRendering') return undefined; // 非离线 → 走 resume 分支
      if (property === 'state') return 'suspended';
      if (property === 'resume') return async () => Promise.reject(new Error('gesture required'));
      return Reflect.get(target, property);
    },
  }) as unknown as AudioContext;
}

function createLaunchHarness(audioContext: AudioContext | null) {
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
    createAudioContext: () => audioContext,
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
  return { game, touch, frames };
}

/** 等待 unlock() 的 promise 链落定（冷启动起播为异步） */
async function settleUnlockPromises() {
  for (let tick = 0; tick < 5; tick += 1) {
    await Promise.resolve();
  }
}

describe('冷启动直入钱包 + BGM 自动起播', () => {
  it('平台允许无手势自动播放：冷启动即启用音频并起播 BGM，无需任何触摸', async () => {
    const harness = createLaunchHarness(createPermissiveAudioContext());
    harness.frames(1);
    await settleUnlockPromises();
    const snapshot = harness.game.getSmokeTestSnapshot();
    expect(snapshot.audioUnlocked).toBe(true);
    expect(snapshot.bgmPlaying).toBe(true);
  });

  it('首次触摸直接作用于翻盖（无标题页转场吞触）', async () => {
    const harness = createLaunchHarness(createPermissiveAudioContext());
    harness.frames(1);
    await settleUnlockPromises();
    // 首触落在翻盖区（钱包上半部）：应立即进入 pressing，而非被标题转场吞掉
    harness.touch('start', 201, 437);
    const snapshot = harness.game.getSmokeTestSnapshot();
    expect(snapshot.flapPhase).toBe('pressing');
  });

  it('平台要求手势：冷启动静默（无 BGM），首触解锁后起播', async () => {
    const harness = createLaunchHarness(createGestureRequiredAudioContext());
    harness.frames(1);
    await settleUnlockPromises();
    // 解锁链路中 resume 失败已被 catch 静默降级，再排空一次微任务
    await settleUnlockPromises();
    expect(harness.game.getSmokeTestSnapshot().audioUnlocked).toBe(false);
    expect(harness.game.getSmokeTestSnapshot().bgmPlaying).toBe(false);

    // 首次触摸（背景区即可）触发 tryUnlockAudio → 本次假上下文仍拒绝 → 维持静默不误播
    harness.touch('start', 200, 150);
    harness.touch('end', 200, 150);
    await settleUnlockPromises();
    expect(harness.game.getSmokeTestSnapshot().audioUnlocked).toBe(false);
    expect(harness.game.getSmokeTestSnapshot().bgmPlaying).toBe(false);
  });
});
