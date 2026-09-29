import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';
import {
  playSilenceBuffer,
  resumeAudioContextIfNeeded,
} from '../../src/core/audio/engine';
import { createWavSampleBytes } from './wav-bytes';

/**
 * 手势解锁与中断恢复单测（任务 5.4 验证入口，对应 procedural-audio 规格）：
 * suspended → resume、静音 buffer 兜底、中断后下次手势重试恢复。
 */

/** 可控的挂起态音频上下文替身（只实现解锁路径所需的表面） */
function createSuspendedAudioContextMock() {
  const mockContext = {
    state: 'suspended' as 'suspended' | 'running',
    resumeCallCount: 0,
    async resume() {
      mockContext.resumeCallCount += 1;
      mockContext.state = 'running';
    },
  };
  return mockContext;
}

describe('恢复挂起的音频上下文', () => {
  it('suspended 状态调用 resume 并转 running', async () => {
    const mockContext = createSuspendedAudioContextMock();
    const resumed = await resumeAudioContextIfNeeded(
      mockContext as unknown as AudioContext,
    );
    expect(resumed).toBe(true);
    expect(mockContext.resumeCallCount).toBe(1);
    expect(mockContext.state).toBe('running');
  });

  it('running 状态直接返回 true（不重复 resume）', async () => {
    const mockContext = createSuspendedAudioContextMock();
    mockContext.state = 'running';
    const resumed = await resumeAudioContextIfNeeded(
      mockContext as unknown as AudioContext,
    );
    expect(resumed).toBe(true);
    expect(mockContext.resumeCallCount).toBe(0);
  });

  it('无 resume 能力的上下文（如离线渲染）视为可用', async () => {
    const offlineLikeContext = { state: 'suspended' } as unknown as AudioContext;
    const resumed = await resumeAudioContextIfNeeded(offlineLikeContext);
    expect(resumed).toBe(true);
  });

  it('resume 抛出异常时返回 false（静默降级）', async () => {
    const failingContext = {
      state: 'suspended',
      async resume() {
        throw new Error('not allowed');
      },
    } as unknown as AudioContext;
    const resumed = await resumeAudioContextIfNeeded(failingContext);
    expect(resumed).toBe(false);
  });
});

describe('静音 buffer 兜底播放', () => {
  it('播放一个 1 样本静音 buffer（旧版 iOS 解锁要求）', () => {
    const startedSources: number[] = [];
    const mockContext = {
      sampleRate: 44100,
      createBuffer: () => ({
        getChannelData: () => new Float32Array(1),
      }),
      createBufferSource: () => ({
        buffer: null,
        connect: () => {},
        start: (when: number) => startedSources.push(when),
        stop: () => {},
        disconnect: () => {},
      }),
      get destination() {
        return { connect: () => {}, disconnect: () => {} };
      },
      get currentTime() {
        return 0;
      },
    } as unknown as AudioContext;
    expect(() => playSilenceBuffer(mockContext)).not.toThrow();
    expect(startedSources.length).toBe(1);
  });
});

describe('AudioEngine 解锁与中断状态机', () => {
  it('首次手势在异步解锁完成前移动信纸时，抽出素材排队且只补播一枚', async () => {
    const context = new OfflineAudioContext(1, 44100, 44100);
    const engine = new AudioEngine({
      createAudioContext: () => context as unknown as AudioContext,
    });
    engine.setEnvelopeDrawOutSample(createWavSampleBytes(0.3));

    // 模拟 Game 在同一轮触摸中先发起 unlock，再同步消费一次有效位移。
    const unlocking = engine.unlock();
    engine.envelopeDrawOutPulse();
    expect(engine.isUnlocked()).toBe(false);
    expect(await unlocking).toBe(true);
    await engine.whenEnvelopeDrawOutSettled();

    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeGreaterThan(0.01);
  });

  it('抬手结束手势时不清掉尚未完成解锁的待播抽出声', async () => {
    const context = new OfflineAudioContext(1, 44100, 44100);
    const engine = new AudioEngine({ createAudioContext: () => context as unknown as AudioContext });
    engine.setEnvelopeDrawOutSample(createWavSampleBytes(0.3));

    const unlocking = engine.unlock();
    engine.envelopeDrawOutPulse();
    engine.finishEnvelopeDrawOutGesture();
    expect(await unlocking).toBe(true);
    await engine.whenEnvelopeDrawOutSettled();

    const rendered = await context.startRendering();
    const peak = Math.max(...rendered.getChannelData(0).map(Math.abs));
    expect(peak).toBeGreaterThan(0.01);
  });

  it('unlock 前静默（不创建上下文、不发声），首次 unlock 后进入已解锁态', async () => {
    let contextCreationCount = 0;
    const engine = new AudioEngine({
      createAudioContext: () => {
        contextCreationCount += 1;
        return createSuspendedAudioContextMock() as unknown as AudioContext;
      },
    });
    expect(engine.isUnlocked()).toBe(false);
    expect(contextCreationCount).toBe(0); // 惰性创建：未用不建

    const unlocked = await engine.unlock();
    expect(unlocked).toBe(true);
    expect(engine.isUnlocked()).toBe(true);
    expect(contextCreationCount).toBe(1);
  });

  it('createAudioContext 返回 null 时 unlock 返回 false（无音频环境静默降级）', async () => {
    const engine = new AudioEngine({ createAudioContext: () => null });
    const unlocked = await engine.unlock();
    expect(unlocked).toBe(false);
    expect(engine.isUnlocked()).toBe(false);
  });

  it('音频中断 begin → 停播并标记；end → 自动恢复续播（系统弹窗遮挡不再静默）', async () => {
    // 真离线上下文：end 恢复要走 startBgm 管线，mock 缺节点会抛错
    const engine = new AudioEngine({
      createAudioContext: () => new OfflineAudioContext(1, 44100, 44100) as unknown as AudioContext,
    });
    await engine.unlock();
    engine.startBgm();
    expect(engine.isReunlockRequired()).toBe(false);
    expect(engine.isPlayingBgm()).toBe(true);

    engine.handleAudioInterruption('begin');
    expect(engine.isReunlockRequired()).toBe(true);
    expect(engine.isPlayingBgm()).toBe(false); // 遮挡期间停播（跟随系统暂停）

    engine.handleAudioInterruption('end');
    await Promise.resolve(); // 恢复可能经 resume 异步链
    expect(engine.isReunlockRequired()).toBe(false); // 弹窗关闭即恢复，无需用户手势
    expect(engine.isUnlocked()).toBe(true);
    expect(engine.isPlayingBgm()).toBe(true);
  });
});
