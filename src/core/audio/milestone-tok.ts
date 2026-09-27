import type { AudioSynthesisParameters } from './parameters';
import { scheduleContinuousFrictionSwell } from './paper-slide';

/**
 * 里程碑木质 tok 音（cash-drawing 规格「里程碑反馈」）：
 * 短促的木质敲击感——triangle 高频起滑落 + 细小噪声瞬态，柔和不做作。
 */

export function scheduleMilestoneTokVoice(
  audioContext: BaseAudioContext,
  destinationNode: AudioNode,
  sharedNoiseBuffer: AudioBuffer | null,
  tokParameters: AudioSynthesisParameters['milestoneTok'],
  startAtSeconds: number,
): void {
  // 木质腔体感：triangle 从 640Hz 滑落到 170Hz（约 90ms）
  const tokOscillator = audioContext.createOscillator();
  tokOscillator.type = 'triangle';
  tokOscillator.frequency.setValueAtTime(tokParameters.startFrequencyHertz, startAtSeconds);
  tokOscillator.frequency.exponentialRampToValueAtTime(
    tokParameters.endFrequencyHertz,
    startAtSeconds + tokParameters.frequencyRampMilliseconds / 1000,
  );

  const tokGainNode = audioContext.createGain();
  tokGainNode.gain.setValueAtTime(0.0001, startAtSeconds);
  tokGainNode.gain.linearRampToValueAtTime(
    tokParameters.peakGain,
    startAtSeconds + tokParameters.attackRampMilliseconds / 1000,
  );
  tokGainNode.gain.exponentialRampToValueAtTime(
    0.01,
    startAtSeconds + tokParameters.totalDurationMilliseconds / 1000,
  );

  tokOscillator.connect(tokGainNode);
  tokGainNode.connect(destinationNode);
  tokOscillator.start(startAtSeconds);
  tokOscillator.stop(startAtSeconds + tokParameters.totalDurationMilliseconds / 1000);

  // 细小噪声瞬态（敲击接触感）
  if (sharedNoiseBuffer) {
    const transientNoiseSource = audioContext.createBufferSource();
    transientNoiseSource.buffer = sharedNoiseBuffer;
    const transientBandpass = audioContext.createBiquadFilter();
    transientBandpass.type = 'bandpass';
    transientBandpass.frequency.value = tokParameters.transientCenterHertz;
    transientBandpass.Q.value = 1.2;
    const transientGainNode = audioContext.createGain();
    transientGainNode.gain.setValueAtTime(0.0001, startAtSeconds);
    transientGainNode.gain.linearRampToValueAtTime(
      tokParameters.transientPeakGain,
      startAtSeconds + tokParameters.attackRampMilliseconds / 1000,
    );
    transientGainNode.gain.exponentialRampToValueAtTime(
      0.01,
      startAtSeconds + tokParameters.transientDecayMilliseconds / 1000,
    );
    transientNoiseSource.connect(transientBandpass);
    transientBandpass.connect(transientGainNode);
    transientGainNode.connect(destinationNode);
    transientNoiseSource.start(startAtSeconds, Math.random() * 1.5);
    transientNoiseSource.stop(startAtSeconds + tokParameters.transientDecayMilliseconds / 1000 + 0.02);
  }
}

/**
 * 连抽收尾轻响（cash-drawing 规格：连抽音效音高随连抽缓慢上行）。
 * v2.6.2：与抓取沙沙同族的单一连续起伏流——噼啪/敲击均为错误形态；
 * 连抽亮度经高通中心随 pitchMultiplier 上移保留。
 */
export function schedulePaperReleasePuff(
  audioContext: BaseAudioContext,
  destinationNode: AudioNode,
  sharedNoiseBuffer: AudioBuffer,
  puffParameters: AudioSynthesisParameters['paperReleasePuff'],
  startAtSeconds: number,
  streakCount: number,
): void {
  // 音高（高通中心）随连抽次数缓慢上行，封顶后回落由调用方在里程碑重置 streak 实现
  const pitchMultiplier = Math.min(
    puffParameters.streakPitchCap,
    1 + streakCount * puffParameters.streakPitchStep,
  );
  scheduleContinuousFrictionSwell(
    audioContext,
    destinationNode,
    sharedNoiseBuffer,
    {
      highpassHertz: puffParameters.highpassHertz * pitchMultiplier,
      lowpassHertz: puffParameters.lowpassHertz,
      swellAttackMilliseconds: puffParameters.swellAttackMilliseconds,
      totalDurationMilliseconds: puffParameters.totalDurationMilliseconds,
      tremoloFrequencyHertz: puffParameters.tremoloFrequencyHertz,
      tremoloDepthRatio: puffParameters.tremoloDepthRatio,
    },
    puffParameters.peakGain,
    startAtSeconds,
    0.31 + streakCount * 0.07,
  );
}
