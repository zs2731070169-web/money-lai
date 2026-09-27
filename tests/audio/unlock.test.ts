import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/core/audio/engine';
import {
  playSilenceBuffer,
  resumeAudioContextIfNeeded,
} from '../../src/core/audio/engine';

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

  it('音频中断 begin → 标记需重解锁；end 后下次 unlock 恢复', async () => {
    const mockContext = createSuspendedAudioContextMock();
    const engine = new AudioEngine({
      createAudioContext: () => mockContext as unknown as AudioContext,
    });
    await engine.unlock();
    expect(engine.isReunlockRequired()).toBe(false);

    engine.handleAudioInterruption('begin');
    expect(engine.isReunlockRequired()).toBe(true);

    engine.handleAudioInterruption('end');
    expect(engine.isReunlockRequired()).toBe(true); // 仍需一次手势确认

    await engine.unlock(); // 下一次手势
    expect(engine.isReunlockRequired()).toBe(false);
    expect(engine.isUnlocked()).toBe(true);
  });
});
