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
 * 晚安剖面 SFX 软化、里程碑静默、BGM 睡眠编排（C4 顶棚）、熄灭期 SFX 归零与 BGM 底板持续。
 */

/** 离线渲染分析：峰值 / 尾段 RMS（熄灭淡出断言用）；可选放大前瞻一次性铺满整段 BGM 调度（模拟编排层每帧泵） */
async function renderForAnalysis(
  renderSeconds: number,
  sampleRate: number,
  act: (engine: AudioEngine) => void,
  scheduleAheadSeconds?: number,
): Promise<{ peakAmplitude: number; nanSampleCount: number; tailRms: number; earlyRms: number; engine: AudioEngine }> {
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
  // 真机由 game.ts 每帧 updateBgm() 前瞻 6s 调度；离线渲染 currentTime 冻结，放大前瞻一次铺满
  if (scheduleAheadSeconds !== undefined) engine.updateBgm(scheduleAheadSeconds);
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
    engine,
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

  it('熄灭淡出目标：SFX 归零、BGM 压至底板增益不淡至无声（sleep-mode 规格）', () => {
    const engine = new AudioEngine({
      createAudioContext: () => {
        throw new Error('查询淡出目标不应触碰音频上下文');
      },
    });
    const targetGains = engine.getSleepDimFadeOutTargetGains();
    expect(targetGains.sfxBusTargetGain).toBe(0); // 操作音效熄灭完成无声
    expect(targetGains.bgmBusTargetGain).toBe(
      AUDIO_SYNTHESIS_PARAMETERS.bedtimeArrangement.bgmDimFloorGain, // 底板可闻
    );
    expect(targetGains.bgmBusTargetGain).toBeGreaterThan(0);
  });

  it('熄灭淡出：长渲染尾段低音量可闻且低于早期、BGM 不停止、无 NaN 无削波', async () => {
    // 低采样率渲染 62s：BGM 起播后立即开始 60s 压低至底板；一次性铺满 70s 调度模拟整夜持续播放
    const analysis = await renderForAnalysis(
      62,
      8000,
      (engine) => {
        engine.setBedtimeAudioProfile(true);
        engine.startBgm();
        engine.beginSleepDimFadeOut();
      },
      70,
    );
    expect(analysis.nanSampleCount).toBe(0);
    expect(analysis.peakAmplitude).toBeLessThanOrEqual(0.9);
    expect(analysis.tailRms).toBeGreaterThan(0.0005); // 底板低音量持续（非无声）
    expect(analysis.tailRms).toBeLessThan(analysis.earlyRms); // 明显低于夜间基准
    expect(analysis.engine.isPlayingBgm()).toBe(true); // 计划器未停止
  });
});
