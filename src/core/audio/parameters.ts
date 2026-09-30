export const AUDIO_SYNTHESIS_PARAMETERS = {
  masterBus: {
    compressorThresholdDecibels: -14, compressorKneeDecibels: 8, compressorRatio: 6,
    compressorAttackSeconds: 0.002, compressorReleaseSeconds: 0.2, masterGain: 0.6,
    globalLowpassHertz: 7000,
  },
  sfxBus: { busGain: 0.6 },
  /** 抽出素材的播放增益：素材峰值约 0.38，经 sfxBus 前先衰减到接近旧合成摩擦声的响度。 */
  envelopeDrawOut: { playbackGain: 0.25 },
  bgm: {
    seed: 20260926, chordDurationSeconds: 14, melodyMinIntervalSeconds: 2,
    melodyMaxIntervalSeconds: 7, melodyCeilingMidi: 60, bgmBusGain: 0.095,
    fadeInSeconds: 2, fadeOutSeconds: 1.5,
  },
} as const;
