import type { AudioSynthesisParameters } from './parameters';

/**
 * 钱包开合音合成（皮革弯折版，procedural-audio 规格 v2.1，实测反馈：不得有「咚」的鼓感）。
 *
 * 纯噪声三层配方，刻意不含任何振荡器（音高滑落即底鼓签名）：
 *   ① 带通 1.3kHz「皮面弯折」——皮革形变的主要质感
 *   ② 低通 420Hz「软垫感」——翻盖落在皮料上的闷垫，无共鸣腔
 *   ③ 高通 4.2kHz「纸堆轻蹭」——口部纸币被带动的极轻沙沙
 * 关闭音为同配方的更闷更轻变体（频率 ×0.8、增益 ×0.85）。
 * voice 全部增益节点登记在释放清单里，供并发抢占时整体平滑收音。
 */

export interface WalletClackVoiceHandles {
  /** 停止时刻（秒，基于上下文时钟）：过期的 voice 不再计入并发 */
  stopAtSeconds: number;
  /** 抢占释放：取消全部增益排程并平滑归零（锚点按包络解析式计算，不读运行时值） */
  releaseAt: (currentSeconds: number, timeConstantSeconds: number) => void;
}

/** 可释放增益节点与其包络描述（解析式求值，杜绝预渲染期读值回退到默认 1） */
interface ReleasableGainEntry {
  gainNode: GainNode;
  startAtSeconds: number;
  attackSeconds: number;
  decaySeconds: number;
  peakGain: number;
}

/** 按调度包络解析式计算 t 时刻的增益值（起坡线性、衰减指数到 0.01） */
function computeEnvelopeValueAt(entry: ReleasableGainEntry, currentSeconds: number): number {
  const elapsedSeconds = currentSeconds - entry.startAtSeconds;
  if (elapsedSeconds <= 0) return 0.0001;
  if (entry.decaySeconds === Number.POSITIVE_INFINITY) return entry.peakGain;
  if (elapsedSeconds < entry.attackSeconds) {
    return 0.0001 + (entry.peakGain - 0.0001) * (elapsedSeconds / entry.attackSeconds);
  }
  const decayRatio = Math.min(
    1,
    (elapsedSeconds - entry.attackSeconds) /
      Math.max(0.001, entry.decaySeconds - entry.attackSeconds),
  );
  return entry.peakGain * Math.pow(0.01 / entry.peakGain, decayRatio);
}

/** 单层噪声参数（内部结构） */
interface LeatherNoiseLayerSpecification {
  filterType: BiquadFilterType;
  frequencyHertz: number;
  qFactor: number | undefined;
  peakGain: number;
  decaySeconds: number;
}

export function scheduleLeatherFoldVoice(
  audioContext: BaseAudioContext,
  destinationNode: AudioNode,
  sharedNoiseBuffer: AudioBuffer,
  clackParameters: AudioSynthesisParameters['walletClack'],
  startAtSeconds: number,
  direction: 'open' | 'close',
): WalletClackVoiceHandles {
  const frequencyScale =
    direction === 'close' ? clackParameters.closeVariantFrequencyScale : 1;
  const gainScale = direction === 'close' ? clackParameters.closeVariantGainScale : 1;

  // 确定性噪声取段偏移：层号×方向派生（替代随机取段，离线回归峰值可复现、开/关相对响度稳定）
  const layerNoiseOffsets = leatherLayerNoiseOffsets(direction);

  const leatherLayers: LeatherNoiseLayerSpecification[] = [
    {
      filterType: 'bandpass',
      frequencyHertz: clackParameters.leatherFlexCenterHertz * frequencyScale,
      qFactor: clackParameters.leatherFlexQFactor,
      peakGain: clackParameters.leatherFlexPeakGain * gainScale,
      decaySeconds: clackParameters.leatherFlexDecayMilliseconds / 1000,
    },
    {
      filterType: 'lowpass',
      frequencyHertz: clackParameters.softPadCutoffHertz * frequencyScale,
      qFactor: undefined,
      peakGain: clackParameters.softPadPeakGain * gainScale,
      decaySeconds: clackParameters.softPadDecayMilliseconds / 1000,
    },
    {
      filterType: 'highpass',
      frequencyHertz: clackParameters.paperBrushCutoffHertz,
      qFactor: undefined,
      peakGain: clackParameters.paperBrushPeakGain * gainScale,
      decaySeconds: clackParameters.paperBrushDecayMilliseconds / 1000,
    },
  ];

  const voiceGainNode = audioContext.createGain();
  voiceGainNode.gain.setValueAtTime(1, startAtSeconds);
  voiceGainNode.connect(destinationNode);
  const releasableGainEntries: ReleasableGainEntry[] = [
    // voice 出口为恒定增益 1（包络恒定，衰减时长无穷大）
    {
      gainNode: voiceGainNode,
      startAtSeconds,
      attackSeconds: 0,
      decaySeconds: Number.POSITIVE_INFINITY,
      peakGain: 1,
    },
  ];

  let latestStopSeconds = startAtSeconds;
  for (let layerIndexInVoice = 0; layerIndexInVoice < leatherLayers.length; layerIndexInVoice += 1) {
    const leatherLayer = leatherLayers[layerIndexInVoice];
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = sharedNoiseBuffer;

    const layerFilter = audioContext.createBiquadFilter();
    layerFilter.type = leatherLayer.filterType;
    layerFilter.frequency.value = leatherLayer.frequencyHertz;
    if (leatherLayer.qFactor !== undefined) {
      layerFilter.Q.value = leatherLayer.qFactor;
    }

    const layerGainNode = audioContext.createGain();
    releasableGainEntries.push({
      gainNode: layerGainNode,
      startAtSeconds,
      attackSeconds: clackParameters.attackRampMilliseconds / 1000,
      decaySeconds: leatherLayer.decaySeconds,
      peakGain: leatherLayer.peakGain,
    });
    // 5ms 线性起坡防爆点，随后指数衰减到 0.01（无音高、无共鸣）
    layerGainNode.gain.setValueAtTime(0.0001, startAtSeconds);
    layerGainNode.gain.linearRampToValueAtTime(
      leatherLayer.peakGain,
      startAtSeconds + clackParameters.attackRampMilliseconds / 1000,
    );
    layerGainNode.gain.exponentialRampToValueAtTime(
      0.01,
      startAtSeconds + leatherLayer.decaySeconds,
    );

    noiseSource.connect(layerFilter);
    layerFilter.connect(layerGainNode);
    layerGainNode.connect(voiceGainNode);
    const layerStopSeconds = startAtSeconds + leatherLayer.decaySeconds + 0.04;
    noiseSource.start(
      startAtSeconds,
      layerNoiseOffsets[layerIndexInVoice],
      leatherLayer.decaySeconds + 0.04,
    );
    noiseSource.stop(layerStopSeconds);
    latestStopSeconds = Math.max(latestStopSeconds, layerStopSeconds);
  }

  return {
    stopAtSeconds: latestStopSeconds,
    releaseAt(currentSeconds: number, timeConstantSeconds: number): void {
      for (const gainEntry of releasableGainEntries) {
        // 锚点用包络解析式计算：cancelScheduledValues 会连同初始事件一起清除，
        // 预渲染期读 .value 会回退到默认值 1，导致被抢占的 voice 反而全增益炸响
        const anchorValue = computeEnvelopeValueAt(gainEntry, currentSeconds);
        gainEntry.gainNode.gain.cancelScheduledValues(currentSeconds);
        gainEntry.gainNode.gain.setValueAtTime(anchorValue, currentSeconds);
        gainEntry.gainNode.gain.setTargetAtTime(0, currentSeconds, timeConstantSeconds);
      }
    },
  };
}

/** 各噪声层的确定性取段偏移（秒）：层号与方向派生，避开 buffer 首尾 */
function leatherLayerNoiseOffsets(direction: 'open' | 'close'): number[] {
  const directionShift = direction === 'close' ? 0.23 : 0;
  return [0, 1, 2].map((layerIndex) => 0.31 + layerIndex * 0.41 + directionShift);
}
