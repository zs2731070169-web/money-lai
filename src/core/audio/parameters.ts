export const AUDIO_SYNTHESIS_PARAMETERS = {
  masterBus: {
    compressorThresholdDecibels: -14, compressorKneeDecibels: 8, compressorRatio: 6,
    compressorAttackSeconds: 0.002, compressorReleaseSeconds: 0.2, masterGain: 0.6,
    globalLowpassHertz: 7000,
  },
  sfxBus: { busGain: 0.6 },
  postcardRustle: {
    highpassHertz: 320, lowpassHertz: 2800, gain: 0.07, fadeOutSeconds: 0.3,
  },
  ignition: { durationSeconds: 0.08, peakGain: 0.5, centerHertz: 620 },
  burn: {
    highpassHertz: 200, lowpassHertz: 800, startGain: 0.22, endGain: 0.10,
    durationSeconds: 2.7, breathingPeriodSeconds: 1,
  },
  extinguish: { durationSeconds: 0.4, startGain: 0.1, lowpassHertz: 520 },
  bgm: {
    seed: 20260926, chordDurationSeconds: 14, melodyMinIntervalSeconds: 2,
    melodyMaxIntervalSeconds: 7, melodyCeilingMidi: 60, bgmBusGain: 0.095,
    fadeInSeconds: 2, fadeOutSeconds: 1.5,
  },
} as const;
