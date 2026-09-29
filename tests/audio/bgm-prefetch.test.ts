import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';

describe('BGM 长阻塞预排', () => {
  it('prefetchBgm(30) 覆盖常规 6s 窗口之外：渲染后段仍有琴音', async () => {
    const sampleRate = 44100;
    const context = new OfflineAudioContext(1, sampleRate * 32, sampleRate);
    const engine = new AudioEngine({ createAudioContext: () => context as unknown as AudioContext });
    await engine.unlock();
    engine.startBgm();
    engine.prefetchBgm(30);
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    // 20–30s 区间（6s 常规窗口远不能及）应仍有非静音采样
    let peak = 0;
    for (let index = sampleRate * 20; index < sampleRate * 30; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
    expect(peak).toBeGreaterThan(0.001);
  });

  it('系统弹窗遮挡（interruption begin/end）后 BGM 自动续播', async () => {
    const sampleRate = 44100;
    const context = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
    const engine = new AudioEngine({ createAudioContext: () => context as unknown as AudioContext });
    await engine.unlock();
    engine.startBgm();
    expect(engine.isPlayingBgm()).toBe(true);

    engine.handleAudioInterruption('begin'); // 原生 confirm 弹出：visibility 翻 hidden
    expect(engine.isPlayingBgm()).toBe(false);

    engine.handleAudioInterruption('end'); // 弹窗关闭：自动恢复续播，无需用户手势
    await Promise.resolve(); // 恢复可能经 resume 异步链
    expect(engine.isReunlockRequired()).toBe(false);
    expect(engine.isPlayingBgm()).toBe(true);
  });
});
