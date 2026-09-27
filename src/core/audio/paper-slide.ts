import type { AudioSynthesisParameters } from './parameters';

/**
 * 抓取瞬态沙沙声（procedural-audio 规格 v2.6.2：一抓一声，连续「沙——沙——」）。
 *
 * 两轮实测教训：快起坡+共振峰=「啪」(v2.6)；离散小 puff 序列=「噼啪」(v2.6.1)。
 * 纸与皮革摩擦的本质是【单一连续噪声流】：
 *   ① 一个噪声声底，只在 ~220ms 窗口内存在
 *   ② 圆滑起伏包络：50ms 渐入 + 指数缓落，全程无瞬态边沿
 *   ③ 「沙沙」双字感 = 约 10Hz 低深度（25%）增益颤音（确定性振荡器音频速率调制，
 *      连续波浪而非离散事件）
 *   ④ 频带 HP600+LP3.4k（宽带无共振，纸贴皮革偏闷；v2.6.3 低通 5k→3.4k 削顶频刺感）
 * 速度仅映射峰值增益；拖拽期间仅此一次，无持续声床。
 */

/** 计算触发时刻速度（0~1）对应的峰值增益 */
function rustlePeakGain(
  rustleParameters: AudioSynthesisParameters['paperGrabRustle'],
  normalizedSpeed: number,
): number {
  const clampedSpeed = Math.min(1, Math.max(0, normalizedSpeed));
  return (
    rustleParameters.peakGainMin +
    (rustleParameters.peakGainMax - rustleParameters.peakGainMin) * clampedSpeed
  );
}

/** 共用实现：单一连续噪声流的圆滑起伏瞬态（抓取沙沙与松手收尾同族） */
export function scheduleContinuousFrictionSwell(
  audioContext: BaseAudioContext,
  destinationNode: AudioNode,
  sharedNoiseBuffer: AudioBuffer,
  swellParameters: {
    highpassHertz: number;
    lowpassHertz: number;
    swellAttackMilliseconds: number;
    totalDurationMilliseconds: number;
    tremoloFrequencyHertz: number;
    tremoloDepthRatio: number;
  },
  peakGain: number,
  startAtSeconds: number,
  deterministicNoiseOffsetSeconds: number,
): void {
  const totalSeconds = swellParameters.totalDurationMilliseconds / 1000;
  const attackSeconds = swellParameters.swellAttackMilliseconds / 1000;

  // 宽带滤链（无共振峰）
  const swellHighpass = audioContext.createBiquadFilter();
  swellHighpass.type = 'highpass';
  swellHighpass.frequency.value = swellParameters.highpassHertz;
  const swellLowpass = audioContext.createBiquadFilter();
  swellLowpass.type = 'lowpass';
  swellLowpass.frequency.value = swellParameters.lowpassHertz;
  swellHighpass.connect(swellLowpass);
  swellLowpass.connect(destinationNode);

  // 圆滑起伏包络：渐入 → 指数缓落（无瞬态边沿）
  const swellGainNode = audioContext.createGain();
  swellGainNode.gain.setValueAtTime(0.0001, startAtSeconds);
  swellGainNode.gain.linearRampToValueAtTime(peakGain, startAtSeconds + attackSeconds);
  swellGainNode.gain.exponentialRampToValueAtTime(0.01, startAtSeconds + totalSeconds);
  swellGainNode.connect(swellHighpass);

  // 「沙沙」双字感：低频颤音在包络之上做连续波浪（±depth×peak，确定性振荡器）
  const tremoloOscillator = audioContext.createOscillator();
  tremoloOscillator.type = 'sine';
  tremoloOscillator.frequency.value = swellParameters.tremoloFrequencyHertz;
  const tremoloDepthGain = audioContext.createGain();
  tremoloDepthGain.gain.value = peakGain * swellParameters.tremoloDepthRatio;
  tremoloOscillator.connect(tremoloDepthGain);
  tremoloDepthGain.connect(swellGainNode.gain);
  tremoloOscillator.start(startAtSeconds);
  tremoloOscillator.stop(startAtSeconds + totalSeconds);

  const swellNoiseSource = audioContext.createBufferSource();
  swellNoiseSource.buffer = sharedNoiseBuffer;
  swellNoiseSource.connect(swellGainNode);
  swellNoiseSource.start(
    startAtSeconds,
    deterministicNoiseOffsetSeconds,
    totalSeconds + 0.03,
  );
  swellNoiseSource.stop(startAtSeconds + totalSeconds + 0.03);
}

export function schedulePaperGrabRustle(
  audioContext: BaseAudioContext,
  destinationNode: AudioNode,
  sharedNoiseBuffer: AudioBuffer,
  rustleParameters: AudioSynthesisParameters['paperGrabRustle'],
  startAtSeconds: number,
  normalizedSpeed: number,
): void {
  const clampedSpeed = Math.min(1, Math.max(0, normalizedSpeed));
  scheduleContinuousFrictionSwell(
    audioContext,
    destinationNode,
    sharedNoiseBuffer,
    rustleParameters,
    rustlePeakGain(rustleParameters, clampedSpeed),
    startAtSeconds,
    0.17 + clampedSpeed * 0.53,
  );
}
