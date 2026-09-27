import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';

/**
 * 放飞声部离线渲染单测（worry-release 规格「放飞声部」，任务 4.1）：
 * 峰值 ≤0.9、无 NaN、总时长 1.2-2.6s、柔和可闻（非静音非爆响）。
 */

const SAMPLE_RATE = 44100;

async function renderAscensionVoice(): Promise<{
  peakAmplitude: number;
  nanSampleCount: number;
  audibleDurationMs: number;
}> {
  const offlineContext = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * 3), SAMPLE_RATE);
  const engine = new AudioEngine({
    createAudioContext: () => offlineContext as unknown as AudioContext,
  });
  await engine.unlock();
  engine.playAscensionVoice();
  const renderedBuffer = await offlineContext.startRendering();
  const firstChannel = renderedBuffer.getChannelData(0);
  let peakAmplitude = 0;
  let nanSampleCount = 0;
  let lastAudibleSampleIndex = 0;
  for (let sampleIndex = 0; sampleIndex < firstChannel.length; sampleIndex += 1) {
    const sample = firstChannel[sampleIndex];
    if (!Number.isFinite(sample)) {
      nanSampleCount += 1;
      continue;
    }
    if (Math.abs(sample) > peakAmplitude) peakAmplitude = Math.abs(sample);
    if (Math.abs(sample) > 0.0008) lastAudibleSampleIndex = sampleIndex;
  }
  return {
    peakAmplitude,
    nanSampleCount,
    audibleDurationMs: (lastAudibleSampleIndex / SAMPLE_RATE) * 1000,
  };
}

describe('放飞声部（气流 + 五声琶音）', () => {
  it('柔和可闻、防爆、无 NaN、时长 1.2-2.6s 一次成段', async () => {
    const analysis = await renderAscensionVoice();
    expect(analysis.nanSampleCount).toBe(0);
    expect(analysis.peakAmplitude).toBeGreaterThan(0.01); // 柔和但清晰可闻
    expect(analysis.peakAmplitude).toBeLessThanOrEqual(0.9); // 防爆总线规格
    expect(analysis.audibleDurationMs).toBeGreaterThan(1_200);
    expect(analysis.audibleDurationMs).toBeLessThan(2_600);
  });

  it('声部确定性：同参数两次渲染逐样本一致', async () => {
    const renderOnce = async () => {
      const offlineContext = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * 3), SAMPLE_RATE);
      const engine = new AudioEngine({
        createAudioContext: () => offlineContext as unknown as AudioContext,
      });
      await engine.unlock();
      engine.playAscensionVoice();
      return (await offlineContext.startRendering()).getChannelData(0);
    };
    const firstChannel = await renderOnce();
    const secondChannel = await renderOnce();
    expect(Array.from(firstChannel.slice(0, 10_000))).toEqual(
      Array.from(secondChannel.slice(0, 10_000)),
    );
  });
});
