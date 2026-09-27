import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { AudioEngine } from '../../src/core/audio/engine';
import { AUDIO_SYNTHESIS_PARAMETERS } from '../../src/core/audio/parameters';
import {
  MELODY_CEILING_MIDI,
  MELODY_SCALE_MIDI,
  createGenerativePianoPlanner,
  midiNoteToFrequencyHertz,
} from '../../src/core/audio/bgm-planner';
import {
  createBgmReverbChain,
  scheduleGenerativePianoNote,
} from '../../src/core/audio/bgm-player';

/**
 * 生成式钢琴 BGM 单测（任务 5.6 验证入口，对应 procedural-audio 规格「生成式钢琴 BGM」）：
 * 种子确定性、五声音阶约束、和弦进行节拍、离线渲染防爆与有声、淡入开关控制。
 */

const BGM_PLANNER_PARAMETERS = {
  chordDurationSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.chordDurationSeconds,
  melodyMinIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyMinIntervalSeconds,
  melodyMaxIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyMaxIntervalSeconds,
  melodyCeilingMidi: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyCeilingMidi,
};

/** 日间基线旋律顶棚（daytime-comfort-baseline：C4 低音域，按八度循环折叠） */
const MELODY_SOUNDED_CEILING_MIDI =
  AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyCeilingMidi ?? MELODY_CEILING_MIDI;

/** 顶棚下的合法发声音高集合：音阶锚点按八度折叠至 ≤ 顶棚 */
const MELODY_SOUNDED_MIDI_SET = new Set(
  MELODY_SCALE_MIDI.map((midi) => {
    let soundedMidi = midi;
    while (soundedMidi > MELODY_SOUNDED_CEILING_MIDI) soundedMidi -= 12;
    return soundedMidi;
  }),
);

describe('BGM 计划器：确定性（种子回归）', () => {
  it('相同种子 → 完全一致的事件序列', () => {
    const firstPlanner = createGenerativePianoPlanner(20260926, BGM_PLANNER_PARAMETERS);
    const secondPlanner = createGenerativePianoPlanner(20260926, BGM_PLANNER_PARAMETERS);
    const firstEvents = firstPlanner.planNextEvents(30);
    const secondEvents = secondPlanner.planNextEvents(30);
    expect(secondEvents).toEqual(firstEvents);
  });

  it('不同种子 → 事件序列不同（不机械等长循环）', () => {
    const firstEvents = createGenerativePianoPlanner(1, BGM_PLANNER_PARAMETERS).planNextEvents(30);
    const secondEvents = createGenerativePianoPlanner(2, BGM_PLANNER_PARAMETERS).planNextEvents(30);
    expect(secondEvents).not.toEqual(firstEvents);
  });

  it('增量推进幂等：不重复返回已计划事件', () => {
    const planner = createGenerativePianoPlanner(20260926, BGM_PLANNER_PARAMETERS);
    const firstBatch = planner.planNextEvents(10);
    const secondBatch = planner.planNextEvents(20);
    const firstBatchTimes = firstBatch.map((event) => event.startAtSeconds);
    for (const event of secondBatch) {
      expect(firstBatchTimes).not.toContain(event.startAtSeconds);
    }
  });
});

describe('BGM 计划器：音乐约束', () => {
  it('旋律音阶锚点恢复原版 C5~A5（独立乐理校验，防实现漂移）', () => {
    expect(MELODY_SCALE_MIDI).toEqual([60, 62, 64, 67, 69, 72, 74, 76, 79, 81]);
  });

  const plannedEvents = createGenerativePianoPlanner(20260926, BGM_PLANNER_PARAMETERS).planNextEvents(40);

  it('旋律发声音高不越日间顶棚（C4）：行走音按八度循环折叠至 ≤ 顶棚', () => {
    const melodyEvents = plannedEvents.filter((event) => event.layer === 'melody');
    for (const melodyEvent of melodyEvents) {
      const approximateMidi = 69 + 12 * Math.log2(melodyEvent.frequencyHertz / 440);
      const matched = Array.from(MELODY_SOUNDED_MIDI_SET).some(
        (midi) => Math.abs(midiNoteToFrequencyHertz(midi) - melodyEvent.frequencyHertz) < 0.5,
      );
      expect(matched).toBe(true);
      expect(approximateMidi).toBeLessThanOrEqual(MELODY_SOUNDED_CEILING_MIDI + 0.01);
    }
  });

  it('旋律音高全部落在顶棚下的五声发声集合（C 大调五声音阶折叠）', () => {
    const melodyEvents = plannedEvents.filter((event) => event.layer === 'melody');
    expect(melodyEvents.length).toBeGreaterThan(5);
    // 发声集合 = 音阶锚点按八度折叠至顶棚以下的音（daytime-comfort：整体低音域）
    const allowedFrequencies = new Set(
      Array.from(MELODY_SOUNDED_MIDI_SET).map((midi) => midiNoteToFrequencyHertz(midi)),
    );
    for (const melodyEvent of melodyEvents) {
      const nearestMatches = Array.from(allowedFrequencies).filter(
        (frequencyHertz) => Math.abs(frequencyHertz - melodyEvent.frequencyHertz) < 0.5,
      );
      expect(nearestMatches.length).toBeGreaterThan(0);
    }
  });

  it('旋律音符间隔在参数区间内（稀疏行走）', () => {
    const melodyStartTimes = plannedEvents
      .filter((event) => event.layer === 'melody')
      .map((event) => event.startAtSeconds)
      .sort((a, b) => a - b);
    for (let index = 1; index < melodyStartTimes.length; index += 1) {
      const gapSeconds = melodyStartTimes[index] - melodyStartTimes[index - 1];
      expect(gapSeconds).toBeGreaterThanOrEqual(BGM_PLANNER_PARAMETERS.melodyMinIntervalSeconds - 0.001);
      expect(gapSeconds).toBeLessThanOrEqual(BGM_PLANNER_PARAMETERS.melodyMaxIntervalSeconds + 0.001);
    }
  });

  it('伴奏为分解和弦：4 个和弦槽 × 6 音，低音根音锁定节拍（无持续铺底）', () => {
    const chordDurationSeconds = AUDIO_SYNTHESIS_PARAMETERS.bgm.chordDurationSeconds;
    // 计划满 4 个完整和弦槽（槽长参数化：daytime-comfort 基线 14s/槽）
    const chordPlannedEvents = createGenerativePianoPlanner(
      20260926,
      BGM_PLANNER_PARAMETERS,
    ).planNextEvents(chordDurationSeconds * 4);
    const chordEvents = chordPlannedEvents.filter(
      (event) => event.layer === 'chord' && event.startAtSeconds < chordDurationSeconds * 4,
    );
    expect(chordEvents.length).toBe(24);
    const bassStartTimes = chordEvents
      .map((event) => event.startAtSeconds)
      .filter((startAtSeconds) =>
        [0, chordDurationSeconds, chordDurationSeconds * 2, chordDurationSeconds * 3].includes(
          startAtSeconds,
        ),
      );
    expect(bassStartTimes.length).toBe(4);
    for (let chordSlot = 0; chordSlot < 4; chordSlot += 1) {
      const slotEventCount = chordEvents.filter(
        (event) =>
          event.startAtSeconds >= chordSlot * chordDurationSeconds &&
          event.startAtSeconds < (chordSlot + 1) * chordDurationSeconds,
      ).length;
      expect(slotEventCount).toBe(6);
    }
  });
});

describe('BGM 离线渲染（引擎集成）', () => {
  it('淡入起播：有声、峰值 ≤0.9、无 NaN、持续时间覆盖多秒', async () => {
    const offlineContext = new OfflineAudioContext(2, Math.round(44100 * 6), 44100);
    const engine = new AudioEngine({
      createAudioContext: () => offlineContext as unknown as AudioContext,
    });
    await engine.unlock();
    engine.startBgm();
    const renderedBuffer = await offlineContext.startRendering();

    let peakAmplitude = 0;
    let nanSampleCount = 0;
    let lastAudibleSampleIndex = 0;
    const channelData = renderedBuffer.getChannelData(0);
    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
      const sample = channelData[sampleIndex];
      if (!Number.isFinite(sample)) {
        nanSampleCount += 1;
        continue;
      }
      peakAmplitude = Math.max(peakAmplitude, Math.abs(sample));
      if (Math.abs(sample) > 0.001) lastAudibleSampleIndex = sampleIndex;
    }
    expect(nanSampleCount).toBe(0);
    expect(peakAmplitude).toBeGreaterThan(0.01); // 淡入起播后可闻
    expect(peakAmplitude).toBeLessThanOrEqual(0.9); // 防爆（规格）
    expect((lastAudibleSampleIndex / 44100) * 1000).toBeGreaterThan(3000); // 持续铺底
  });

  it('BGM 音量低于操作音效总线（busGain 0.095 < master 0.6）', () => {
    expect(AUDIO_SYNTHESIS_PARAMETERS.bgm.bgmBusGain).toBeLessThan(
      AUDIO_SYNTHESIS_PARAMETERS.masterBus.masterGain,
    );
  });
});

/**
 * Goertzel 单频点功率（Hann 窗加权）：返回该频率分量的均方值（RMS²）。
 * 必须加窗——矩形窗旁瓣只按 1/Δf 衰减，65Hz 强基音会在 1.4kHz 泄漏出 -46dB 假能量；
 * Hann 窗旁瓣按 1/Δf³ 衰减，把谐音泄漏压到可忽略。
 */
function goertzelMeanSquareAtFrequency(
  samples: Float32Array,
  sampleRate: number,
  frequencyHertz: number,
): number {
  const windowSize = samples.length;
  const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHertz) / sampleRate);
  let firstPrevious = 0;
  let secondPrevious = 0;
  for (let sampleIndex = 0; sampleIndex < windowSize; sampleIndex += 1) {
    const hannWeight = 0.5 - 0.5 * Math.cos((2 * Math.PI * sampleIndex) / (windowSize - 1));
    const weightedSample = samples[sampleIndex] * hannWeight;
    const current = weightedSample + coefficient * firstPrevious - secondPrevious;
    secondPrevious = firstPrevious;
    firstPrevious = current;
  }
  const power =
    firstPrevious * firstPrevious +
    secondPrevious * secondPrevious -
    coefficient * firstPrevious * secondPrevious;
  // 精确落于该频点的正弦幅值 A 满足 P = A²(Σw)²/4，Hann 的 Σw = N/2 → 均方 = A²/2 = 8P/N²
  return (8 * power) / (windowSize * windowSize);
}

describe('BGM 琴槌噪声路径（实测反馈：持续「莎莎」声，移除）', () => {
  it('单音渲染在 1.4~1.8kHz 琴槌噪声带内能量≈0（起音无噪声成分）', async () => {
    const sampleRate = 44100;
    const offlineContext = new OfflineAudioContext(2, Math.floor(sampleRate * 0.8), sampleRate);

    // 低音伴奏音（C2≈65.4Hz）：分音最高 4×65.4≈262Hz，与 1.4~1.8kHz 测带完全分离，
    // 排除谐音泄漏误报——若噪声起音路径回归，带内能量只会来自它
    scheduleGenerativePianoNote(
      offlineContext,
      offlineContext.destination,
      offlineContext.destination,
      {
        startAtSeconds: 0.05,
        frequencyHertz: midiNoteToFrequencyHertz(36),
        velocity: 1,
        durationSeconds: 0.5,
        layer: 'chord',
      },
    );

    const renderedBuffer = await offlineContext.startRendering();
    // 取前 0.3s（琴槌包络区间）做双声道混缩
    const analysisSampleCount = Math.floor(sampleRate * 0.3);
    const leftChannel = renderedBuffer.getChannelData(0);
    const rightChannel = renderedBuffer.getChannelData(1);
    const monoSamples = new Float32Array(analysisSampleCount);
    for (let sampleIndex = 0; sampleIndex < analysisSampleCount; sampleIndex += 1) {
      monoSamples[sampleIndex] = (leftChannel[sampleIndex] + rightChannel[sampleIndex]) / 2;
    }

    const hammerBandMeanSquare = [1400, 1600, 1800].reduce(
      (total, frequencyHertz) =>
        total + goertzelMeanSquareAtFrequency(monoSamples, sampleRate, frequencyHertz),
      0,
    );
    expect(Math.sqrt(hammerBandMeanSquare)).toBeLessThan(1e-4);
  });
});

describe('BGM 混响实现契约（实时欠载治理：卷积换算法混响）', () => {
  it('createBgmReverbChain MUST NOT 创建 ConvolverNode（欠载根因不得回归）', () => {
    const offlineContext = new OfflineAudioContext(2, 128, 44100);
    // 禁用卷积工厂：若实现仍走 ConvolverNode（2.2s 白噪 IR 每音频块常驻计算）必抛
    offlineContext.createConvolver = () => {
      throw new Error('BGM 混响禁用 ConvolverNode（实时欠载根因）');
    };
    expect(() => createBgmReverbChain(offlineContext, offlineContext.destination)).not.toThrow();
  });

  it('湿声尾音存在：脉冲经混响链后 0.4~1.0s 仍有能量，峰值 ≤0.9、无 NaN', async () => {
    const sampleRate = 44100;
    const offlineContext = new OfflineAudioContext(2, Math.floor(sampleRate * 1.2), sampleRate);
    const reverbChain = createBgmReverbChain(offlineContext, offlineContext.destination);

    // 单样本幅度 1 脉冲注入湿声发送
    const impulseBuffer = offlineContext.createBuffer(1, 1, sampleRate);
    impulseBuffer.getChannelData(0)[0] = 1;
    const impulseSource = offlineContext.createBufferSource();
    impulseSource.buffer = impulseBuffer;
    impulseSource.connect(reverbChain.wetSendInputNode);
    impulseSource.start(0.1);

    const renderedBuffer = await offlineContext.startRendering();
    const channelData = renderedBuffer.getChannelData(0);
    let tailWindowEnergy = 0;
    let peakAmplitude = 0;
    let nanSampleCount = 0;
    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
      const sample = channelData[sampleIndex];
      if (!Number.isFinite(sample)) {
        nanSampleCount += 1;
        continue;
      }
      peakAmplitude = Math.max(peakAmplitude, Math.abs(sample));
      if (sampleIndex >= Math.floor(0.4 * sampleRate) && sampleIndex < Math.floor(1.0 * sampleRate)) {
        tailWindowEnergy += sample * sample;
      }
    }
    expect(nanSampleCount).toBe(0);
    expect(peakAmplitude).toBeLessThanOrEqual(0.9);
    expect(tailWindowEnergy).toBeGreaterThan(1e-6); // 混响尾存在性
  });
});
