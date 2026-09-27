/**
 * 程序化合成参数常量快照（procedural-audio 规格的「参数落库」）。
 *
 * 全部音色的合成参数集中于此：调音即改这里，快照测试保证不漂移；
 * 治愈纪律：主声部仅 sine/triangle、能量主体 150Hz-2kHz、高频只做点缀。
 */

export interface AudioSynthesisParameters {
  masterBus: {
    compressorThresholdDecibels: number;
    compressorKneeDecibels: number;
    compressorRatio: number;
    compressorAttackSeconds: number;
    compressorReleaseSeconds: number;
    masterGain: number;
    globalLowpassHertz: number;
  };
  sfxBus: {
    /** 操作音效总线增益：整体软化（daytime-comfort-baseline 实测反馈：×0.6 更舒适） */
    busGain: number;
  };
  walletClack: {
    attackRampMilliseconds: number;
    leatherFlexCenterHertz: number;
    leatherFlexQFactor: number;
    leatherFlexPeakGain: number;
    leatherFlexDecayMilliseconds: number;
    softPadCutoffHertz: number;
    softPadPeakGain: number;
    softPadDecayMilliseconds: number;
    paperBrushCutoffHertz: number;
    paperBrushPeakGain: number;
    paperBrushDecayMilliseconds: number;
    closeVariantFrequencyScale: number;
    closeVariantGainScale: number;
  };
  paperGrabRustle: {
    highpassHertz: number;
    lowpassHertz: number;
    swellAttackMilliseconds: number;
    totalDurationMilliseconds: number;
    tremoloFrequencyHertz: number;
    tremoloDepthRatio: number;
    peakGainMin: number;
    peakGainMax: number;
  };
  concurrency: {
    clackVoiceLimit: number;
    preemptionReleaseMilliseconds: number;
  };
  milestoneTok: {
    startFrequencyHertz: number;
    endFrequencyHertz: number;
    frequencyRampMilliseconds: number;
    totalDurationMilliseconds: number;
    peakGain: number;
    attackRampMilliseconds: number;
    transientCenterHertz: number;
    transientPeakGain: number;
    transientDecayMilliseconds: number;
  };
  paperReleasePuff: {
    highpassHertz: number;
    lowpassHertz: number;
    swellAttackMilliseconds: number;
    totalDurationMilliseconds: number;
    tremoloFrequencyHertz: number;
    tremoloDepthRatio: number;
    streakPitchStep: number;
    streakPitchCap: number;
    peakGain: number;
  };
  bgm: {
    /** 生成种子：固定值保证 BGM 计划可回归 */
    seed: number;
    chordDurationSeconds: number;
    melodyMinIntervalSeconds: number;
    melodyMaxIntervalSeconds: number;
    /** 旋律发声音高顶棚（MIDI 60 = C4）：行走音按八度折叠至 ≤ 顶棚（daytime-comfort：低音域更舒适） */
    melodyCeilingMidi?: number;
    /** BGM 总线增益（显著低于操作音效） */
    bgmBusGain: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
  };
  ascensionVoice: {
    /** 气流层高通/低通（宽带气流，渐入无瞬态） */
    breathHighpassHertz: number;
    breathLowpassHertz: number;
    /** 气流渐入与衰减（毫秒；总时长 = attack + decay） */
    breathAttackMilliseconds: number;
    breathDecayMilliseconds: number;
    /** 气流峰值增益 */
    breathPeakGain: number;
    /** 五声琶音（MIDI，下行收束；C 大调五声血统与 BGM 同源） */
    arpeggioMidiNotes: number[];
    /** 首音延迟与逐音间隔（毫秒） */
    arpeggioFirstNoteDelayMilliseconds: number;
    arpeggioNoteIntervalMilliseconds: number;
    /** 单音时长（秒，指数衰减尾巴） */
    arpeggioNoteDurationSeconds: number;
    /** 琶音单音峰值增益 */
    arpeggioPeakGain: number;
  };
}

export const AUDIO_SYNTHESIS_PARAMETERS: AudioSynthesisParameters = {
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
    // 实测反馈 v2.6.3：太吵太刺 → 峰值增益降 ~4.5dB、低通 5000→3400 削顶频毛刺（纸贴皮革偏闷定位）
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
  ascensionVoice: {
    breathHighpassHertz: 500,
    breathLowpassHertz: 3000,
    breathAttackMilliseconds: 260,
    breathDecayMilliseconds: 900,
    breathPeakGain: 0.055,
    arpeggioMidiNotes: [76, 72, 69, 67, 64],
    arpeggioFirstNoteDelayMilliseconds: 180,
    arpeggioNoteIntervalMilliseconds: 110,
    arpeggioNoteDurationSeconds: 1.15,
    arpeggioPeakGain: 0.085,
  },
};
