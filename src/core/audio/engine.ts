import { createSeededRandomNumberGenerator } from '../utility/deterministic-random';
import { GenerativePianoPlanner, createGenerativePianoPlanner } from './bgm-planner';
import { createBgmReverbChain, scheduleGenerativePianoNote } from './bgm-player';
import { AUDIO_SYNTHESIS_PARAMETERS } from './parameters';
import { scheduleAscensionVoice } from './ascension-voice';
import { schedulePaperGrabRustle } from './paper-slide';
import { WalletClackVoiceHandles, scheduleLeatherFoldVoice } from './wallet-clack';
import {
  scheduleMilestoneTokVoice,
} from './milestone-tok';

/**
 * AudioEngine（procedural-audio 规格的编排门面）：
 * 惰性创建上下文（经适配器注入，测试注入离线上下文）、总线防爆、
 * 开合音并发抢占、摩擦音持久 voice、手势解锁与中断恢复。
 */

export interface AudioEngineOptions {
  /** 音频上下文工厂：由 PlatformAdapter 提供（Web/微信），测试注入离线上下文 */
  createAudioContext: () => BaseAudioContext | null;
}

/** 恢复挂起的音频上下文；离线上下文（有 startRendering）与无 resume 能力者视为可用 */
export async function resumeAudioContextIfNeeded(
  audioContext: BaseAudioContext,
): Promise<boolean> {
  const offlineCapableContext = audioContext as Partial<OfflineAudioContext>;
  if (typeof offlineCapableContext.startRendering === 'function') return true;
  const resumableContext = audioContext as Partial<AudioContext>;
  if (typeof resumableContext.resume !== 'function') return true;
  if (audioContext.state !== 'suspended') return true;
  try {
    await resumableContext.resume();
    return audioContext.state !== 'suspended';
  } catch {
    return false; // 静默降级：解锁失败不影响游戏进行
  }
}

/** 播放 1 样本静音 buffer（旧版 iOS 在 resume 之外还要求播放一次才真正解锁） */
export function playSilenceBuffer(audioContext: BaseAudioContext): void {
  const silenceBuffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
  const silenceSource = audioContext.createBufferSource();
  silenceSource.buffer = silenceBuffer;
  silenceSource.connect(audioContext.destination);
  silenceSource.start(audioContext.currentTime);
}

export class AudioEngine {
  private readonly options: AudioEngineOptions;
  private audioContext: BaseAudioContext | null = null;
  /** 总线入口（全局低通）：音效与 BGM 均汇入此处 */
  private busInputNode: AudioNode | null = null;
  private bgmBusGainNode: GainNode | null = null;
  private sharedNoiseBuffer: AudioBuffer | null = null;
  private activeClackVoices: WalletClackVoiceHandles[] = [];
  private unlocked = false;
  private reunlockRequired = false;
  private soundEnabled = true;
  private bgmEnabled = true;
  private bgmPlaying = false;
  private bgmPlanner: GenerativePianoPlanner | null = null;
  private bgmScheduleOriginSeconds = 0;
  private bgmDryInputNode: AudioNode | null = null;
  private bgmWetSendNode: AudioNode | null = null;

  constructor(options: AudioEngineOptions) {
    this.options = options;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** 中断后是否需要下一次手势重新解锁（规格：中断恢复） */
  isReunlockRequired(): boolean {
    return this.reunlockRequired;
  }

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
  }

  /** 惰性创建音频上下文（未使用不创建） */
  private ensureAudioContext(): BaseAudioContext | null {
    if (this.audioContext) return this.audioContext;
    this.audioContext = this.options.createAudioContext();
    return this.audioContext;
  }

  /** 确保发声管线就绪（上下文 + 总线 + 共享白噪） */
  private ensureSoundPipeline(): BaseAudioContext | null {
    const audioContext = this.ensureAudioContext();
    if (!audioContext) return null;
    if (!this.busInputNode) {
      const globalLowpassFilter = audioContext.createBiquadFilter();
      globalLowpassFilter.type = 'lowpass';
      globalLowpassFilter.frequency.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.globalLowpassHertz;

      const compressorNode = audioContext.createDynamicsCompressor();
      compressorNode.threshold.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorThresholdDecibels;
      compressorNode.knee.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorKneeDecibels;
      compressorNode.ratio.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorRatio;
      compressorNode.attack.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorAttackSeconds;
      compressorNode.release.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorReleaseSeconds;

      const masterGainNode = audioContext.createGain();
      masterGainNode.gain.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.masterGain;

      // 操作音效软化总线（daytime-comfort-baseline：SFX 语音统一经 0.6 增益汇入全局链）
      const sfxBusGainNode = audioContext.createGain();
      sfxBusGainNode.gain.value = AUDIO_SYNTHESIS_PARAMETERS.sfxBus.busGain;
      sfxBusGainNode.connect(globalLowpassFilter);

      globalLowpassFilter.connect(compressorNode);
      compressorNode.connect(masterGainNode);
      masterGainNode.connect(audioContext.destination);
      this.busInputNode = sfxBusGainNode;

      // BGM 子总线：汇入同一总线链，但增益显著低于操作音效（规格）
      const bgmGainNode = audioContext.createGain();
      bgmGainNode.gain.value = AUDIO_SYNTHESIS_PARAMETERS.bgm.bgmBusGain;
      bgmGainNode.connect(globalLowpassFilter);
      this.bgmBusGainNode = bgmGainNode;
    }
    return audioContext;
  }

  /** 共享白噪 buffer：全局一次生成（固定种子的确定性白噪，回归测试可复现），开合噪层与摩擦音复用（禁每帧新建） */
  private getSharedNoiseBuffer(audioContext: BaseAudioContext): AudioBuffer | null {
    if (!this.sharedNoiseBuffer) {
      try {
        const bufferSampleCount = Math.floor(audioContext.sampleRate * 2);
        const noiseBuffer = audioContext.createBuffer(1, bufferSampleCount, audioContext.sampleRate);
        const channelData = noiseBuffer.getChannelData(0);
        // 固定种子确定性白噪：跨运行一致，音频回归断言可复现
        const nextRandomUnit = createSeededRandomNumberGenerator(0x5eed);
        for (let sampleIndex = 0; sampleIndex < bufferSampleCount; sampleIndex += 1) {
          channelData[sampleIndex] = nextRandomUnit() * 2 - 1;
        }
        this.sharedNoiseBuffer = noiseBuffer;
      } catch {
        return null;
      }
    }
    return this.sharedNoiseBuffer;
  }

  /** 首次手势解锁：resume + 静音 buffer 兜底；失败静默降级（规格：解锁前不出声） */
  async unlock(): Promise<boolean> {
    const audioContext = this.ensureAudioContext();
    if (!audioContext) {
      this.unlocked = false;
      return false;
    }
    const resumed = await resumeAudioContextIfNeeded(audioContext);
    if (!resumed) {
      return false;
    }
    try {
      playSilenceBuffer(audioContext);
    } catch {
      // 部分环境（能力不完整的上下文）不支持：解锁仍视为成功
    }
    this.unlocked = true;
    this.reunlockRequired = false;
    return true;
  }

  /** 音频中断处理：begin 停持续音并标记需重解锁；end 保持标记等待下次手势 */
  handleAudioInterruption(phase: 'begin' | 'end'): void {
    if (phase === 'begin') {
      this.reunlockRequired = true;
      this.unlocked = false;
    }
  }

  /** 播放一次钱包开合皮革音（含并发抢占：同类上限 3，超限平滑释放最旧） */
  playWalletClack(direction: 'open' | 'close'): void {
    if (!this.soundEnabled) return;
    const audioContext = this.ensureSoundPipeline();
    if (!audioContext || !this.busInputNode) return;
    const sharedNoiseBuffer = this.getSharedNoiseBuffer(audioContext);
    if (!sharedNoiseBuffer) return;
    const currentSeconds = audioContext.currentTime;

    this.activeClackVoices = this.activeClackVoices.filter(
      (voice) => voice.stopAtSeconds > currentSeconds,
    );
    const { clackVoiceLimit, preemptionReleaseMilliseconds } =
      AUDIO_SYNTHESIS_PARAMETERS.concurrency;
    while (this.activeClackVoices.length >= clackVoiceLimit) {
      const oldestVoice = this.activeClackVoices.shift();
      oldestVoice?.releaseAt(currentSeconds, preemptionReleaseMilliseconds / 1000);
    }

    const voiceHandles = scheduleLeatherFoldVoice(
      audioContext,
      this.busInputNode,
      sharedNoiseBuffer,
      AUDIO_SYNTHESIS_PARAMETERS.walletClack,
      currentSeconds,
      direction,
    );
    this.activeClackVoices.push(voiceHandles);
  }

  getActiveClackVoiceCount(): number {
    if (!this.audioContext) return 0;
    const currentSeconds = this.audioContext.currentTime;
    this.activeClackVoices = this.activeClackVoices.filter(
      (voice) => voice.stopAtSeconds > currentSeconds,
    );
    return this.activeClackVoices.length;
  }

  /** 抓取瞬态沙响：拖拽期间唯一一次摩擦声（首次移动时刻触发，规格 v2.6） */
  playPaperGrabRustle(normalizedSpeed: number): void {
    if (!this.soundEnabled) return;
    const audioContext = this.ensureSoundPipeline();
    if (!audioContext || !this.busInputNode) return;
    const sharedNoiseBuffer = this.getSharedNoiseBuffer(audioContext);
    if (!sharedNoiseBuffer) return;
    schedulePaperGrabRustle(
      audioContext,
      this.busInputNode,
      sharedNoiseBuffer,
      AUDIO_SYNTHESIS_PARAMETERS.paperGrabRustle,
      audioContext.currentTime,
      normalizedSpeed,
    );
  }

  /** 淡入起播生成式钢琴 BGM（规格：解锁后淡入；回前台恢复；幂等由调用方 isPlayingBgm 判断） */
  startBgm(): void {
    if (!this.bgmEnabled) return;
    const audioContext = this.ensureSoundPipeline();
    const bgmBusGainNode = this.bgmBusGainNode;
    if (!audioContext || !bgmBusGainNode) return;

    const currentSeconds = audioContext.currentTime;
    const { fadeInSeconds, bgmBusGain } = AUDIO_SYNTHESIS_PARAMETERS.bgm;
    bgmBusGainNode.gain.cancelScheduledValues(currentSeconds);
    try {
      bgmBusGainNode.gain.setValueAtTime(bgmBusGainNode.gain.value, currentSeconds);
    } catch {
      bgmBusGainNode.gain.setValueAtTime(0, currentSeconds);
    }
    bgmBusGainNode.gain.linearRampToValueAtTime(bgmBusGain, currentSeconds + fadeInSeconds);

    if (!this.bgmDryInputNode || !this.bgmWetSendNode) {
      const reverbChain = createBgmReverbChain(audioContext, bgmBusGainNode);
      this.bgmDryInputNode = reverbChain.dryInputNode;
      this.bgmWetSendNode = reverbChain.wetSendInputNode;
    }

    this.bgmPlanner = createGenerativePianoPlanner(AUDIO_SYNTHESIS_PARAMETERS.bgm.seed, {
      chordDurationSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.chordDurationSeconds,
      melodyMinIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyMinIntervalSeconds,
      melodyMaxIntervalSeconds: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyMaxIntervalSeconds,
      melodyCeilingMidi: AUDIO_SYNTHESIS_PARAMETERS.bgm.melodyCeilingMidi,
    });
    this.bgmScheduleOriginSeconds = currentSeconds;
    this.bgmPlaying = true;
    this.updateBgm();
  }

  /** 每帧调用：前瞻调度后续 BGM 事件（计划器游标保证增量幂等） */
  updateBgm(): void {
    if (!this.bgmPlaying || !this.bgmPlanner || !this.audioContext) return;
    if (!this.bgmDryInputNode || !this.bgmWetSendNode) return;
    const horizonSeconds = this.audioContext.currentTime + 6;
    const noteEvents = this.bgmPlanner.planNextEvents(
      horizonSeconds - this.bgmScheduleOriginSeconds,
    );
    for (const noteEvent of noteEvents) {
      scheduleGenerativePianoNote(
        this.audioContext,
        this.bgmDryInputNode,
        this.bgmWetSendNode,
        {
          ...noteEvent,
          startAtSeconds: noteEvent.startAtSeconds + this.bgmScheduleOriginSeconds,
        },
      );
    }
  }

  /** 淡出停止 BGM（规格：进后台淡出暂停、关闭开关即时淡出） */
  stopBgm(): void {
    this.bgmPlaying = false;
    this.bgmPlanner = null;
    const audioContext = this.audioContext;
    const bgmBusGainNode = this.bgmBusGainNode;
    if (!audioContext || !bgmBusGainNode) return;
    const currentSeconds = audioContext.currentTime;
    bgmBusGainNode.gain.cancelScheduledValues(currentSeconds);
    try {
      bgmBusGainNode.gain.setValueAtTime(bgmBusGainNode.gain.value, currentSeconds);
    } catch {
      // 忽略读取失败
    }
    bgmBusGainNode.gain.linearRampToValueAtTime(0, currentSeconds + AUDIO_SYNTHESIS_PARAMETERS.bgm.fadeOutSeconds);
  }

  setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    if (enabled) {
      if (this.unlocked) this.startBgm();
    } else {
      this.stopBgm();
    }
  }

  /** 前后台切换（规格：后台淡出暂停、回前台恢复） */
  handleAppVisibilityChange(visible: boolean): void {
    if (visible) {
      if (this.bgmEnabled && this.unlocked) this.startBgm();
    } else {
      this.stopBgm();
    }
  }

  /** BGM 是否正在播放（编排层判断恢复起播幂等用） */
  isPlayingBgm(): boolean {
    return this.bgmPlaying;
  }

  /** 里程碑木质 tok 音（每 100 张，cash-drawing 规格） */
  /** 放飞声部（worry-release 规格）：轻气流 + 五声琶音一次成段，无持续声床 */
  playAscensionVoice(): void {
    if (!this.soundEnabled) return;
    const audioContext = this.ensureSoundPipeline();
    if (!audioContext || !this.busInputNode) return;
    scheduleAscensionVoice(
      audioContext,
      this.busInputNode,
      this.getSharedNoiseBuffer(audioContext),
      AUDIO_SYNTHESIS_PARAMETERS.ascensionVoice,
      audioContext.currentTime,
    );
  }

  playMilestoneTok(): void {
    if (!this.soundEnabled) return;
    const audioContext = this.ensureSoundPipeline();
    if (!audioContext || !this.busInputNode) return;
    scheduleMilestoneTokVoice(
      audioContext,
      this.busInputNode,
      this.getSharedNoiseBuffer(audioContext),
      AUDIO_SYNTHESIS_PARAMETERS.milestoneTok,
      audioContext.currentTime,
    );
  }
}
