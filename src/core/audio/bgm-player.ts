import { GenerativePianoNoteEvent } from './bgm-planner';

/**
 * 生成式钢琴 BGM 播放层（实测反馈迭代：要钢琴、不要电子琴）。
 *
 * 音色设计对照真实钢琴的声学特征（消除「电子琴/管风琴」感的来源）：
 * ① 分音独立衰减——高次分音显著更快衰减（钢琴弦各次分音阻尼不同；持续等长衰减=电子琴）
 * ② 刚性失谐——高次分音频率略偏高（真实琴弦拉伸，纯整数倍=合成感）
 * ③ 同音双弦微失谐拍频——每个分音两根 ±1.3 音分的「弦」叠加（钢琴厚度与温度感）
 * 起音为毫秒级纯谐音快起坡，MUST NOT 含噪声成分（实测反馈：琴槌瞬态白噪在设备上
 * 听感为持续「莎莎」声，噪声起音路径已整体移除，见 remove-bgm-hammer-noise 变更）。
 * 混响：立体声反馈延迟网络（FDN，纯节点组合，零素材）——替代卷积混响；
 * 旧「ConvolverNode + 2.2s 白噪 IR」每音频块常驻卷积是实时欠载（细碎咔哒）的
 * 恒定负载源，见 replace-bgm-convolver-reverb 变更。
 */

export interface BgmReverbChain {
  /** 干声输入节点 */
  dryInputNode: AudioNode;
  /** 混响发送节点 */
  wetSendInputNode: AudioNode;
}

export function createBgmReverbChain(
  audioContext: BaseAudioContext,
  destinationNode: AudioNode,
): BgmReverbChain {
  // 立体声反馈延迟网络（FDN）：纯节点组合的算法混响（零素材）。
  // 每声道 4 条互质时长的反馈延迟线，循环内低通让高频每圈多衰减（暗尾，
  // 兼修旧白噪 IR 高低频同速衰减的颗粒感），左右声道交叉馈给出立体声宽度。
  const wetOutputGainNode = audioContext.createGain();
  wetOutputGainNode.gain.value = 0.4; // 湿声电平：与旧卷积混响一致
  const leftSummerNode = audioContext.createGain();
  const rightSummerNode = audioContext.createGain();
  const stereoMergerNode = audioContext.createChannelMerger(2);
  leftSummerNode.connect(stereoMergerNode, 0, 0);
  rightSummerNode.connect(stereoMergerNode, 0, 1);
  stereoMergerNode.connect(wetOutputGainNode);
  wetOutputGainNode.connect(destinationNode);

  const wetSendInputNode = audioContext.createGain();

  // 延迟线时长（秒）：声道内互质、左右错开，避免周期性梳妆染色
  const delayLineSeconds: Record<'left' | 'right', number[]> = {
    left: [0.087, 0.113, 0.149, 0.191],
    right: [0.097, 0.127, 0.157, 0.197],
  };
  const lineInputGain = 0.5; // 8 线汇入的防叠加削波
  const loopFeedbackGain = 0.72; // -60dB 尾长最短线约 1.8s / 最长线约 4.1s，量级对齐旧 IR(2.2s)
  const loopLowpassHertz = 2400; // 循环低通：尾音逐圈变暗（音色规格「偏暗收敛」）
  const crossFeedGain = 0.3; // 左右线互相馈给对侧声道 → 立体声宽度

  const summerNodes = { left: leftSummerNode, right: rightSummerNode } as const;
  for (const channelName of ['left', 'right'] as const) {
    for (const delaySeconds of delayLineSeconds[channelName]) {
      // 输入分配：湿声发送 → 本线
      const lineInputGainNode = audioContext.createGain();
      lineInputGainNode.gain.value = lineInputGain;
      wetSendInputNode.connect(lineInputGainNode);

      // 反馈回路：入 → delay → 低通 → 反馈增益 → 回 delay（环内 DelayNode ≥87ms，合法）
      const delayNode = audioContext.createDelay(1);
      delayNode.delayTime.value = delaySeconds;
      lineInputGainNode.connect(delayNode);
      const loopLowpassNode = audioContext.createBiquadFilter();
      loopLowpassNode.type = 'lowpass';
      loopLowpassNode.frequency.value = loopLowpassHertz;
      delayNode.connect(loopLowpassNode);
      const loopFeedbackGainNode = audioContext.createGain();
      loopFeedbackGainNode.gain.value = loopFeedbackGain;
      loopLowpassNode.connect(loopFeedbackGainNode);
      loopFeedbackGainNode.connect(delayNode);

      // 输出抽头：本声道全量 + 对侧声道交叉馈给
      loopLowpassNode.connect(summerNodes[channelName]);
      const crossFeedGainNode = audioContext.createGain();
      crossFeedGainNode.gain.value = crossFeedGain;
      loopLowpassNode.connect(crossFeedGainNode);
      crossFeedGainNode.connect(
        channelName === 'left' ? rightSummerNode : leftSummerNode,
      );
    }
  }

  const dryInputNode = audioContext.createGain();
  dryInputNode.connect(destinationNode);

  return { dryInputNode, wetSendInputNode };
}

/** 钢琴分音表：独立衰减（高次快衰）+ 刚性失谐（高次偏高，单位音分） */
interface PianoPartialSpecification {
  frequencyMultiplier: number;
  gainScale: number;
  /** 该分音的最大持续时长（秒）：决定衰减速度 */
  maxDecaySeconds: number;
  /** 非谐波拉伸（音分） */
  inharmonicDetuneCents: number;
}

const PIANO_PARTIALS: PianoPartialSpecification[] = [
  { frequencyMultiplier: 1, gainScale: 0.55, maxDecaySeconds: 3.8, inharmonicDetuneCents: 0 },
  { frequencyMultiplier: 2, gainScale: 0.23, maxDecaySeconds: 1.9, inharmonicDetuneCents: 4 },
  { frequencyMultiplier: 3, gainScale: 0.08, maxDecaySeconds: 1.05, inharmonicDetuneCents: 9 },
  { frequencyMultiplier: 4, gainScale: 0.03, maxDecaySeconds: 0.55, inharmonicDetuneCents: 15 },
];

/** 同音双弦的微失谐（音分）：两弦各偏一侧，叠加出钢琴的自然拍频厚度 */
const UNISON_STRING_DETUNE_CENTS = 1.3;

/** 单个分音的衰减终点（秒）：不超过音符时值与该分音的最大持续 */
function partialDecaySeconds(
  noteEvent: GenerativePianoNoteEvent,
  partial: PianoPartialSpecification,
): number {
  return Math.max(0.12, Math.min(noteEvent.durationSeconds, partial.maxDecaySeconds));
}

export function scheduleGenerativePianoNote(
  audioContext: BaseAudioContext,
  dryDestinationNode: AudioNode,
  wetSendDestinationNode: AudioNode,
  noteEvent: GenerativePianoNoteEvent,
): void {
  const startAtSeconds = noteEvent.startAtSeconds;
  // 起音：旋律毫秒级快起坡（纯谐音，无噪声成分），伴奏琶音稍柔
  const attackSeconds = noteEvent.layer === 'melody' ? 0.005 : 0.014;

  const voiceGainNode = audioContext.createGain();
  voiceGainNode.gain.value = 1;
  const voiceLowpassFilter = audioContext.createBiquadFilter();
  voiceLowpassFilter.type = 'lowpass';
  voiceLowpassFilter.frequency.value = 3200;
  voiceGainNode.connect(voiceLowpassFilter);
  voiceLowpassFilter.connect(dryDestinationNode);
  voiceLowpassFilter.connect(wetSendDestinationNode);

  // ①②③ 每个分音两根微失谐的「弦」，各自指数衰减到 0.01
  for (const partial of PIANO_PARTIALS) {
    const decaySeconds = partialDecaySeconds(noteEvent, partial);
    const partialPeakGain = noteEvent.velocity * partial.gainScale * 0.5;
    for (const stringDetuneCents of [-UNISON_STRING_DETUNE_CENTS, UNISON_STRING_DETUNE_CENTS]) {
      const oscillatorNode = audioContext.createOscillator();
      oscillatorNode.type = 'sine';
      oscillatorNode.frequency.value = noteEvent.frequencyHertz * partial.frequencyMultiplier;
      oscillatorNode.detune.value = partial.inharmonicDetuneCents + stringDetuneCents;

      const partialGainNode = audioContext.createGain();
      partialGainNode.gain.setValueAtTime(0.0001, startAtSeconds);
      partialGainNode.gain.linearRampToValueAtTime(
        partialPeakGain,
        startAtSeconds + attackSeconds,
      );
      partialGainNode.gain.exponentialRampToValueAtTime(0.01, startAtSeconds + decaySeconds);

      oscillatorNode.connect(partialGainNode);
      partialGainNode.connect(voiceGainNode);
      oscillatorNode.start(startAtSeconds);
      oscillatorNode.stop(startAtSeconds + decaySeconds + 0.05);
    }
  }
}
