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
    /** BGM 总线增益（显著低于操作音效，约 -12dB 量级） */
    bgmBusGain: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
  };
  bedtimeArrangement: {
    /** 晚安 BGM 和弦时长（秒）：较日间更慢 */
    chordDurationSeconds: number;
    /** 晚安旋律最小间隔（秒）：更稀疏 */
    melodyMinIntervalSeconds: number;
    /** 晚安旋律最大间隔（秒）：长呼吸更长 */
    melodyMaxIntervalSeconds: number;
    /** 晚安旋律顶棚（MIDI 60 = C4）：发声音高整体再压一个八度（sleep-mode 规格） */
    melodyCeilingMidi: number;
    /** 晚安 BGM 总线增益：较日间再压约 -4.5dB */
    bgmBusGain: number;
    /** 晚安操作音效整体增益（软化音量） */
    sfxGainScale: number;
    /** 熄灭淡出时长（秒）：与渐进熄灭 60s 渐暗同步 */
    dimFadeOutSeconds: number;
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
    chordDurationSeconds: 10,
    melodyMinIntervalSeconds: 1,
    melodyMaxIntervalSeconds: 4.5,
    bgmBusGain: 0.16,
    fadeInSeconds: 2,
    fadeOutSeconds: 1.5,
  },
  bedtimeArrangement: {
    chordDurationSeconds: 14,
    melodyMinIntervalSeconds: 2,
    melodyMaxIntervalSeconds: 7,
    melodyCeilingMidi: 60,
    bgmBusGain: 0.095,
    sfxGainScale: 0.6,
    dimFadeOutSeconds: 60,
  },
};
