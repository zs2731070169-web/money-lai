import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';
import { scheduleBurningNoise, scheduleExtinguish, scheduleIgnition, startPostcardRustle, stopNoiseVoice } from '../../src/core/audio/fire-sound';
import { AUDIO_SYNTHESIS_PARAMETERS } from '../../src/core/audio/parameters';

const SAMPLE_RATE = 44100;

function noiseBuffer(context: OfflineAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, SAMPLE_RATE * 4, SAMPLE_RATE); const data = buffer.getChannelData(0); let seed = 991;
  for (let index = 0; index < data.length; index += 1) { seed = Math.imul(seed ^ (seed >>> 15), 2246822519); data[index] = ((seed >>> 0) / 0xffff_ffff) * 2 - 1; }
  return buffer;
}

describe('燃信程序化音频回归', () => {
  it('拖纸声 300ms 收尾，再播放 80ms 点燃、2.7s 连续燃烧和 400ms 熄灭', async () => {
    const context = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * 3.8), SAMPLE_RATE); const noise = noiseBuffer(context);
    const rustle = startPostcardRustle(context, context.destination, noise, 0, AUDIO_SYNTHESIS_PARAMETERS.postcardRustle);
    stopNoiseVoice(rustle, 0, AUDIO_SYNTHESIS_PARAMETERS.postcardRustle.fadeOutSeconds);
    scheduleIgnition(context, context.destination, noise, 0.3, AUDIO_SYNTHESIS_PARAMETERS.ignition);
    scheduleBurningNoise(context, context.destination, noise, 0.3, AUDIO_SYNTHESIS_PARAMETERS.burn);
    scheduleExtinguish(context, context.destination, noise, 3.0, AUDIO_SYNTHESIS_PARAMETERS.extinguish);
    const rendered = await context.startRendering(); const data = rendered.getChannelData(0);
    let peak = 0; let nan = 0; let maximumDelta = 0;
    for (let index = 1; index < data.length; index += 1) { if (!Number.isFinite(data[index])) nan += 1; peak = Math.max(peak, Math.abs(data[index])); maximumDelta = Math.max(maximumDelta, Math.abs(data[index] - data[index - 1])); }
    expect(AUDIO_SYNTHESIS_PARAMETERS.postcardRustle.fadeOutSeconds).toBe(0.3);
    expect(AUDIO_SYNTHESIS_PARAMETERS.ignition).toMatchObject({ durationSeconds: 0.08, peakGain: 0.5 });
    expect(AUDIO_SYNTHESIS_PARAMETERS.burn).toMatchObject({ highpassHertz: 200, lowpassHertz: 800, startGain: 0.22, endGain: 0.10, durationSeconds: 2.7 });
    expect(AUDIO_SYNTHESIS_PARAMETERS.burn.breathingPeriodSeconds).toBeGreaterThanOrEqual(0.8);
    expect(AUDIO_SYNTHESIS_PARAMETERS.burn.breathingPeriodSeconds).toBeLessThanOrEqual(1.2);
    expect(AUDIO_SYNTHESIS_PARAMETERS.extinguish).toMatchObject({ durationSeconds: 0.4, startGain: 0.1 });
    expect(nan).toBe(0); expect(peak).toBeGreaterThan(0.01); expect(peak).toBeLessThanOrEqual(0.9); expect(maximumDelta).toBeLessThan(0.5);
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
