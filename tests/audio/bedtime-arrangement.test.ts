import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';
import { AUDIO_SYNTHESIS_PARAMETERS } from '../../src/core/audio/parameters';
import {
  createGenerativePianoPlanner,
  midiNoteToFrequencyHertz,
} from '../../src/core/audio/bgm-planner';

/**
 * 睡眠音频编排单测（sleep-mode 规格，任务 3.x）：
 * 晚安剖面 SFX 软化、里程碑静默、BGM 睡眠编排（C4 顶棚）、熄灭同步淡出。
 */

/** 离线渲染分析：峰值 / 尾段 RMS（熄灭淡出断言用） */
async function renderForAnalysis(
  renderSeconds: number,
  sampleRate: number,
  act: (engine: AudioEngine) => void,
): Promise<{ peakAmplitude: number; nanSampleCount: number; tailRms: number; earlyRms: number }> {
  const offlineContext = new OfflineAudioContext(
    2,
    Math.round(sampleRate * renderSeconds),
    sampleRate,
  );
  const engine = new AudioEngine({
    createAudioContext: () => offlineContext as unknown as AudioContext,
  });
  await engine.unlock();
  act(engine);
  const renderedBuffer = await offlineContext.startRendering();
  const firstChannel = renderedBuffer.getChannelData(0);
  let peakAmplitude = 0;
  let nanSampleCount = 0;
  let squaredSumEarly = 0;
  let squaredSumTail = 0;
  const tailStartIndex = Math.floor(firstChannel.length * 0.95);
  for (let sampleIndex = 0; sampleIndex < firstChannel.length; sampleIndex += 1) {
    const sample = firstChannel[sampleIndex];
    if (!Number.isFinite(sample)) {
      nanSampleCount += 1;
      continue;
    }
    if (Math.abs(sample) > peakAmplitude) peakAmplitude = Math.abs(sample);
    if (sampleIndex < tailStartIndex) squaredSumEarly += sample * sample;
    else squaredSumTail += sample * sample;
  }
  return {
    peakAmplitude,
    nanSampleCount,
    tailRms: Math.sqrt(squaredSumTail / Math.max(1, firstChannel.length - tailStartIndex)),
    earlyRms: Math.sqrt(squaredSumEarly / Math.max(1, tailStartIndex)),
  };
}

describe('晚安剖面：SFX 软化与里程碑静默', () => {
  it('夜间开合音较日间软化（峰值更低但仍可闻）', async () => {
    const dayAnalysis = await renderForAnalysis(0.6, 44100, (engine) => {
      engine.playWalletClack('open');
    });
    const nightAnalysis = await renderForAnalysis(0.6, 44100, (engine) => {
      engine.setBedtimeAudioProfile(true);
      engine.playWalletClack('open');
    });
    expect(dayAnalysis.nanSampleCount).toBe(0);
    expect(nightAnalysis.nanSampleCount).toBe(0);
    expect(dayAnalysis.peakAmplitude).toBeGreaterThan(0.02);
    expect(nightAnalysis.peakAmplitude).toBeGreaterThan(0.005); // 软化非静默
    expect(nightAnalysis.peakAmplitude).toBeLessThan(dayAnalysis.peakAmplitude);
  });

  it('夜间里程碑音全静默（呈现静默，规格硬约束）', async () => {
    const dayAnalysis = await renderForAnalysis(0.4, 44100, (engine) => {
      engine.playMilestoneTok();
    });
    const nightAnalysis = await renderForAnalysis(0.4, 44100, (engine) => {
      engine.setBedtimeAudioProfile(true);
      engine.playMilestoneTok();
    });
    expect(dayAnalysis.peakAmplitude).toBeGreaterThan(0.02);
    expect(nightAnalysis.peakAmplitude).toBeLessThan(0.0005); // 完全无声
    expect(nightAnalysis.nanSampleCount).toBe(0);
  });

  it('退出晚安剖面后里程碑音恢复（开关双向）', async () => {
    const analysis = await renderForAnalysis(0.4, 44100, (engine) => {
      engine.setBedtimeAudioProfile(true);
      engine.setBedtimeAudioProfile(false);
      engine.playMilestoneTok();
    });
    expect(analysis.peakAmplitude).toBeGreaterThan(0.02);
  });
});

describe('晚安剖面：BGM 睡眠编排', () => {
  it('计划器级：晚安编排放宽顶棚到 C4，全部旋律发声音高 ≤ C4', () => {
    const planner = createGenerativePianoPlanner(AUDIO_SYNTHESIS_PARAMETERS.bgm.seed, {
      chordDurationSeconds: AUDIO_SYNTHESIS_PARAMETERS.bedtimeArrangement.chordDurationSeconds,
      melodyMinIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bedtimeArrangement.melodyMinIntervalSeconds,
      melodyMaxIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bedtimeArrangement.melodyMaxIntervalSeconds,
      melodyCeilingMidi: AUDIO_SYNTHESIS_PARAMETERS.bedtimeArrangement.melodyCeilingMidi,
    });
    const noteEvents = planner.planNextEvents(120);
    const melodyEvents = noteEvents.filter((noteEvent) => noteEvent.layer === 'melody');
    expect(melodyEvents.length).toBeGreaterThan(10);
    const ceilingFrequencyHertz = midiNoteToFrequencyHertz(
      AUDIO_SYNTHESIS_PARAMETERS.bedtimeArrangement.melodyCeilingMidi,
    );
    for (const melodyEvent of melodyEvents) {
      expect(melodyEvent.frequencyHertz).toBeLessThanOrEqual(ceilingFrequencyHertz + 0.01);
    }
  });

  it('计划器级：日间缺省顶棚仍为 C5（既有行为不变）', () => {
    const planner = createGenerativePianoPlanner(AUDIO_SYNTHESIS_PARAMETERS.bgm.seed, {
      chordDurationSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.chordDurationSeconds,
      melodyMinIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyMinIntervalSeconds,
      melodyMaxIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyMaxIntervalSeconds,
    });
    const noteEvents = planner.planNextEvents(120);
    const melodyEvents = noteEvents.filter((noteEvent) => noteEvent.layer === 'melody');
    const c5FrequencyHertz = midiNoteToFrequencyHertz(72);
    for (const melodyEvent of melodyEvents) {
      expect(melodyEvent.frequencyHertz).toBeLessThanOrEqual(c5FrequencyHertz + 0.01);
    }
  });

  it('熄灭淡出：长渲染尾段近无声、全程无 NaN 无削波', async () => {
    // 低采样率渲染 62s：BGM 解锁起播后立即开始 60s 淡出
    const analysis = await renderForAnalysis(62, 8000, (engine) => {
      engine.setBedtimeAudioProfile(true);
      engine.startBgm();
      engine.beginSleepDimFadeOut();
    });
    expect(analysis.nanSampleCount).toBe(0);
    expect(analysis.peakAmplitude).toBeLessThanOrEqual(0.9);
    expect(analysis.tailRms).toBeLessThan(0.0005); // 淡出终点无声
  });
});
