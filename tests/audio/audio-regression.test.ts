import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';
import { createWavSampleBytes } from './wav-bytes';

const SAMPLE_RATE = 44100;

describe('倾诉程序化音频回归', () => {
  it('抽出声播放随包素材一次且不循环，其后保持静默', async () => {
    const context = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * 1.2), SAMPLE_RATE);
    const engine = new AudioEngine({ createAudioContext: () => context as unknown as AudioContext });
    engine.setEnvelopeDrawOutSample(createWavSampleBytes(0.6));
    await engine.unlock();
    engine.envelopeDrawOutPulse();
    await engine.whenEnvelopeDrawOutSettled();
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);
    let nan = 0; let peak = 0;
    for (const sample of data) { if (!Number.isFinite(sample)) nan += 1; peak = Math.max(peak, Math.abs(sample)); }
    // 素材前 50ms 可听、其后静默：断言有可听开头且不产生循环
    const audibleWindow = Math.max(...data.slice(0, Math.round(SAMPLE_RATE * 0.05)).map(Math.abs));
    const tailWindow = Math.max(...data.slice(Math.round(SAMPLE_RATE * 0.1), Math.round(SAMPLE_RATE * 0.5)).map(Math.abs));
    expect(audibleWindow).toBeGreaterThan(0.01);
    expect(tailWindow).toBeLessThan(0.005);
    expect(nan).toBe(0); expect(peak).toBeLessThanOrEqual(0.9);
  });

  it('素材缺失或解码失败时抽信手势静默，不回退合成摩擦声', async () => {
    const context = new OfflineAudioContext(1, 44100, SAMPLE_RATE);
    const engine = new AudioEngine({ createAudioContext: () => context as unknown as AudioContext });
    await engine.unlock();
    engine.envelopeDrawOutPulse();
    engine.resetEnvelopeDrawOutGesture();
    engine.envelopeDrawOutPulse();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rendered = await context.startRendering();
    let peak = 0;
    for (const sample of rendered.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeLessThan(0.005);
  });

  it('钢琴持续播放叠加收好长音时无 NaN 且峰值不超过 0.9', async () => {
    const context = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * 3.2), SAMPLE_RATE);
    const engine = new AudioEngine({ createAudioContext: () => context as unknown as AudioContext });
    await engine.unlock(); engine.startBgm(); engine.settleLongNote();
    const rendered = await context.startRendering(); let peak = 0; let nan = 0;
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      for (const sample of rendered.getChannelData(channel)) { if (!Number.isFinite(sample)) nan += 1; else peak = Math.max(peak, Math.abs(sample)); }
    }
    expect(nan).toBe(0); expect(peak).toBeGreaterThan(0.01); expect(peak).toBeLessThanOrEqual(0.9);
  });
});
