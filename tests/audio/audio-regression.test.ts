import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';
import { scheduleBurningNoise, scheduleExtinguish, scheduleIgnition } from '../../src/core/audio/fire-sound';
import { AUDIO_SYNTHESIS_PARAMETERS } from '../../src/core/audio/parameters';
import { createWavSampleBytes } from './wav-bytes';

const SAMPLE_RATE = 44100;

function noiseBuffer(context: OfflineAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, SAMPLE_RATE * 4, SAMPLE_RATE); const data = buffer.getChannelData(0); let seed = 991;
  for (let index = 0; index < data.length; index += 1) { seed = Math.imul(seed ^ (seed >>> 15), 2246822519); data[index] = ((seed >>> 0) / 0xffff_ffff) * 2 - 1; }
  return buffer;
}

describe('燃信程序化音频回归', () => {
  it('抽出声播放随包素材一次且不循环，点燃前其余时段静默；点燃 80ms、燃烧 2.7s、熄灭 400ms 依规格合成', async () => {
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
    const context = new OfflineAudioContext(1, 44100, 44100);
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

  it('点燃 80ms、2.7s 连续燃烧和 400ms 熄灭的合成规格保持锁定', async () => {
    const context = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * 4.4), SAMPLE_RATE); const noise = noiseBuffer(context);
    scheduleIgnition(context, context.destination, noise, 1.0, AUDIO_SYNTHESIS_PARAMETERS.ignition);
    scheduleBurningNoise(context, context.destination, noise, 1.0, AUDIO_SYNTHESIS_PARAMETERS.burn);
    scheduleExtinguish(context, context.destination, noise, 3.7, AUDIO_SYNTHESIS_PARAMETERS.extinguish);
    const rendered = await context.startRendering(); const data = rendered.getChannelData(0);
    let peak = 0; let nan = 0; let maximumDelta = 0;
    for (let index = 1; index < data.length; index += 1) { if (!Number.isFinite(data[index])) nan += 1; peak = Math.max(peak, Math.abs(data[index])); maximumDelta = Math.max(maximumDelta, Math.abs(data[index] - data[index - 1])); }
    expect(AUDIO_SYNTHESIS_PARAMETERS.ignition).toMatchObject({ durationSeconds: 0.08, peakGain: 0.5 });
    expect(AUDIO_SYNTHESIS_PARAMETERS.burn).toMatchObject({ highpassHertz: 200, lowpassHertz: 800, startGain: 0.22, endGain: 0.10, durationSeconds: 2.7 });
    expect(AUDIO_SYNTHESIS_PARAMETERS.burn.breathingPeriodSeconds).toBeGreaterThanOrEqual(0.8);
    expect(AUDIO_SYNTHESIS_PARAMETERS.burn.breathingPeriodSeconds).toBeLessThanOrEqual(1.2);
    expect(AUDIO_SYNTHESIS_PARAMETERS.extinguish).toMatchObject({ durationSeconds: 0.4, startGain: 0.1 });
    expect(nan).toBe(0); expect(peak).toBeGreaterThan(0.01); expect(peak).toBeLessThanOrEqual(0.9); expect(maximumDelta).toBeLessThan(0.5);
    // 点燃前保持静默
    const gapWindow = Math.max(...data.slice(Math.round(SAMPLE_RATE * 0.3), Math.round(SAMPLE_RATE * 0.98)).map(Math.abs));
    expect(gapWindow).toBeLessThan(0.005);
  });

  it('钢琴与燃烧声叠加时无 NaN 且峰值不超过 0.9', async () => {
    const context = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * 3.2), SAMPLE_RATE);
    const engine = new AudioEngine({ createAudioContext: () => context as unknown as AudioContext });
    await engine.unlock(); engine.startBgm(); engine.ignite();
    const rendered = await context.startRendering(); let peak = 0; let nan = 0;
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      for (const sample of rendered.getChannelData(channel)) { if (!Number.isFinite(sample)) nan += 1; else peak = Math.max(peak, Math.abs(sample)); }
    }
    expect(nan).toBe(0); expect(peak).toBeGreaterThan(0.01); expect(peak).toBeLessThanOrEqual(0.9);
  });
});
