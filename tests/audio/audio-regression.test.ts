import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';
import { AUDIO_SYNTHESIS_PARAMETERS } from '../../src/core/audio/parameters';

/**
 * 音频回归测试（任务 5.1/5.2/5.3 验证入口，对应 procedural-audio 规格）：
 * OfflineAudioContext 离线渲染 + 峰值 ≤0.9 / 无 NaN / 时长断言 + 参数快照 + 并发抢占。
 */

const SAMPLE_RATE = 44100;

/** 离线渲染：以注入的引擎行为渲染指定秒数并分析 */
async function renderWithAudioEngine(
  renderSeconds: number,
  act: (engine: AudioEngine) => void,
): Promise<{ peakAmplitude: number; nanSampleCount: number; audibleDurationMs: number }> {
  const offlineContext = new OfflineAudioContext(
    2,
    Math.round(SAMPLE_RATE * renderSeconds),
    SAMPLE_RATE,
  );
  const engine = new AudioEngine({
    createAudioContext: () => offlineContext as unknown as AudioContext,
  });
  await engine.unlock();
  act(engine);
  const renderedBuffer = await offlineContext.startRendering();

  let peakAmplitude = 0;
  let nanSampleCount = 0;
  let lastAudibleSampleIndex = 0;
  const firstChannel = renderedBuffer.getChannelData(0);
  for (let sampleIndex = 0; sampleIndex < firstChannel.length; sampleIndex += 1) {
    const sample = firstChannel[sampleIndex];
    if (!Number.isFinite(sample)) {
      nanSampleCount += 1;
      continue;
    }
    if (Math.abs(sample) > peakAmplitude) peakAmplitude = Math.abs(sample);
    if (Math.abs(sample) > 0.001) lastAudibleSampleIndex = sampleIndex;
  }
  return {
    peakAmplitude,
    nanSampleCount,
    audibleDurationMs: (lastAudibleSampleIndex / SAMPLE_RATE) * 1000,
  };
}

describe('音频回归：开合皮革音（任务 10.3，无鼓类签名）', () => {
  it('开启音：峰值 ≤0.9、无 NaN、非静音、时长 30~200ms（短促干燥）', async () => {
    const analysis = await renderWithAudioEngine(0.6, (engine) => {
      engine.playWalletClack('open');
    });
    expect(analysis.nanSampleCount).toBe(0);
    expect(analysis.peakAmplitude).toBeGreaterThan(0.02); // 非静音（配方整体更安静）
    expect(analysis.peakAmplitude).toBeLessThanOrEqual(0.9); // 规格：防爆音
    expect(analysis.audibleDurationMs).toBeGreaterThan(30);
    expect(analysis.audibleDurationMs).toBeLessThan(200);
  });

  it('关闭音为更轻的变体（峰值低于开启音）', async () => {
    const openAnalysis = await renderWithAudioEngine(0.4, (engine) => {
      engine.playWalletClack('open');
    });
    const closeAnalysis = await renderWithAudioEngine(0.4, (engine) => {
      engine.playWalletClack('close');
    });
    expect(closeAnalysis.peakAmplitude).toBeGreaterThan(0.01);
    expect(closeAnalysis.peakAmplitude).toBeLessThan(openAnalysis.peakAmplitude);
  });
});

describe('音频回归：抓取瞬态沙响（任务 v2.6，一抓一声）', () => {
  it('单次沙沙（连续起伏流）：非静音、峰值 ≤0.9、无 NaN、总长 ~220ms <350ms', async () => {
    const analysis = await renderWithAudioEngine(0.8, (engine) => {
      engine.playPaperGrabRustle(0.7);
    });
    expect(analysis.nanSampleCount).toBe(0);
    expect(analysis.peakAmplitude).toBeGreaterThan(0.02);
    expect(analysis.peakAmplitude).toBeLessThanOrEqual(0.9);
    expect(analysis.audibleDurationMs).toBeGreaterThan(60);
    expect(analysis.audibleDurationMs).toBeLessThan(350);
  });

  it('速度微调：慢抓比快抓更轻', async () => {
    const slowAnalysis = await renderWithAudioEngine(0.4, (engine) => {
      engine.playPaperGrabRustle(0.1);
    });
    const fastAnalysis = await renderWithAudioEngine(0.4, (engine) => {
      engine.playPaperGrabRustle(1);
    });
    expect(slowAnalysis.peakAmplitude).toBeLessThan(fastAnalysis.peakAmplitude);
  });
});

describe('音频回归：并发抢占（任务 5.3，规格：极速连抽不破）', () => {
  it('同刻 5 连发开合音 → 活跃 voice 不超过上限 3 且峰值 ≤0.9', async () => {
    const analysis = await renderWithAudioEngine(0.6, (engine) => {
      for (let clackIndex = 0; clackIndex < 5; clackIndex += 1) {
        engine.playWalletClack('open');
        expect(engine.getActiveClackVoiceCount()).toBeLessThanOrEqual(3);
      }
      expect(engine.getActiveClackVoiceCount()).toBe(3);
    });
    expect(analysis.nanSampleCount).toBe(0);
    expect(analysis.peakAmplitude).toBeLessThanOrEqual(0.9);
  });
});

describe('合成参数快照（调音必改快照，防漂移）', () => {
  it('参数常量与已归档快照一致', () => {
    expect(AUDIO_SYNTHESIS_PARAMETERS).toEqual({
      masterBus: {
        compressorThresholdDecibels: -14,
        compressorKneeDecibels: 8,
        compressorRatio: 6,
        compressorAttackSeconds: 0.002,
        compressorReleaseSeconds: 0.2,
        masterGain: 0.6,
        globalLowpassHertz: 7000,
      },
      sfxBus: {
        busGain: 0.6,
      },
      walletClack: {
        attackRampMilliseconds: 5,
        leatherFlexCenterHertz: 1300,
        leatherFlexQFactor: 0.7,
        leatherFlexPeakGain: 0.22,
        leatherFlexDecayMilliseconds: 60,
        softPadCutoffHertz: 420,
        softPadPeakGain: 0.12,
        softPadDecayMilliseconds: 70,
        paperBrushCutoffHertz: 4200,
        paperBrushPeakGain: 0.05,
        paperBrushDecayMilliseconds: 35,
        closeVariantFrequencyScale: 0.8,
        closeVariantGainScale: 0.85,
      },
      paperGrabRustle: {
        highpassHertz: 600,
        lowpassHertz: 3400,
        swellAttackMilliseconds: 70,
        totalDurationMilliseconds: 220,
        tremoloFrequencyHertz: 10,
        tremoloDepthRatio: 0.25,
        peakGainMin: 0.02,
        peakGainMax: 0.07,
      },
      concurrency: {
        clackVoiceLimit: 3,
        preemptionReleaseMilliseconds: 20,
      },
      milestoneTok: {
        startFrequencyHertz: 640,
        endFrequencyHertz: 170,
        frequencyRampMilliseconds: 90,
        totalDurationMilliseconds: 140,
        peakGain: 0.3,
        attackRampMilliseconds: 2,
        transientCenterHertz: 2400,
        transientPeakGain: 0.12,
        transientDecayMilliseconds: 30,
      },
      paperReleasePuff: {
        highpassHertz: 1100,
        lowpassHertz: 5000,
        swellAttackMilliseconds: 40,
        totalDurationMilliseconds: 180,
        tremoloFrequencyHertz: 9,
        tremoloDepthRatio: 0.2,
        streakPitchStep: 0.06,
        streakPitchCap: 1.6,
        peakGain: 0.15,
      },
      bgm: {
        seed: 20260926,
        chordDurationSeconds: 14,
        melodyMinIntervalSeconds: 2,
        melodyMaxIntervalSeconds: 7,
        melodyCeilingMidi: 60,
        bgmBusGain: 0.095,
        fadeInSeconds: 2,
        fadeOutSeconds: 1.5,
      },
      bedtimeArrangement: {
        chordDurationSeconds: 14,
        melodyMinIntervalSeconds: 2,
        melodyMaxIntervalSeconds: 7,
        melodyCeilingMidi: 60,
        bgmBusGain: 0.095,
        bgmDimFloorGain: 0.05,
        sfxGainScale: 0.6,
        dimFadeOutSeconds: 60,
      },
    });
  });
});
