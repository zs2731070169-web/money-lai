import { createSeededRandomNumberGenerator } from '../utility/deterministic-random';
import { createGenerativePianoPlanner, midiNoteToFrequencyHertz, type GenerativePianoPlanner } from './bgm-planner';
import { createBgmReverbChain, scheduleGenerativePianoNote } from './bgm-player';
import { scheduleBurningNoise, scheduleExtinguish, scheduleIgnition } from './fire-sound';
import { AUDIO_SYNTHESIS_PARAMETERS } from './parameters';

export interface AudioEngineOptions { createAudioContext: () => BaseAudioContext | null }

export async function resumeAudioContextIfNeeded(audioContext: BaseAudioContext): Promise<boolean> {
  const offline = audioContext as Partial<OfflineAudioContext>; if (typeof offline.startRendering === 'function') return true;
  const resumable = audioContext as Partial<AudioContext>; if (typeof resumable.resume !== 'function' || audioContext.state !== 'suspended') return true;
  try { await resumable.resume(); return audioContext.state !== 'suspended'; } catch { return false; }
}

export function playSilenceBuffer(audioContext: BaseAudioContext): void {
  const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate); const source = audioContext.createBufferSource(); source.buffer = buffer; source.connect(audioContext.destination); source.start(audioContext.currentTime);
}

export class AudioEngine {
  private context: BaseAudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private reunlockRequired = false;
  /** 随包「信纸抽出」素材：原始字节在启动时注入，首次发声时才解码（音频上下文保持惰性创建）。 */
  private envelopeDrawOutBytes: ArrayBuffer | null = null;
  private envelopeDrawOutBuffer: AudioBuffer | null = null;
  private envelopeDrawOutDecodeFailed = false;
  /** 进行中的解码/补播链；测试等待其结算以保证离线渲染前素材已调度。 */
  private envelopeDrawOutDecoding: Promise<void> | null = null;
  private envelopeDrawOutPlayedForGesture = false;
  /** 首个触摸同时完成音频解锁时，暂存一次抽出声，避免异步解锁竞态丢声。 */
  private pendingEnvelopeDrawOutPulse = false;
  private bgmPlaying = false;
  private planner: GenerativePianoPlanner | null = null;
  private bgmOrigin = 0;
  private bgmDry: AudioNode | null = null;
  private bgmWet: AudioNode | null = null;
  constructor(private readonly options: AudioEngineOptions) {}

  private ensureContext(): BaseAudioContext | null { if (!this.context) this.context = this.options.createAudioContext(); return this.context; }
  private ensurePipeline(): BaseAudioContext | null {
    const context = this.ensureContext(); if (!context) return null;
    if (!this.sfxBus) {
      const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.globalLowpassHertz;
      const compressor = context.createDynamicsCompressor(); const master = context.createGain();
      compressor.threshold.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorThresholdDecibels; compressor.knee.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorKneeDecibels; compressor.ratio.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorRatio; compressor.attack.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorAttackSeconds; compressor.release.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.compressorReleaseSeconds; master.gain.value = AUDIO_SYNTHESIS_PARAMETERS.masterBus.masterGain;
      lowpass.connect(compressor); compressor.connect(master); master.connect(context.destination);
      this.sfxBus = context.createGain(); this.sfxBus.gain.value = AUDIO_SYNTHESIS_PARAMETERS.sfxBus.busGain; this.sfxBus.connect(lowpass);
      this.bgmBus = context.createGain(); this.bgmBus.gain.value = 0; this.bgmBus.connect(lowpass);
    }
    return context;
  }
  private noiseBuffer(context: BaseAudioContext): AudioBuffer | null {
    if (this.noise) return this.noise;
    try { const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate); const data = buffer.getChannelData(0); const random = createSeededRandomNumberGenerator(0x1e77e7); for (let index = 0; index < data.length; index += 1) data[index] = random() * 2 - 1; this.noise = buffer; return buffer; } catch { return null; }
  }
  isUnlocked(): boolean { return this.unlocked; }
  isReunlockRequired(): boolean { return this.reunlockRequired; }
  isPlayingBgm(): boolean { return this.bgmPlaying; }
  async unlock(): Promise<boolean> {
    const context = this.ensureContext(); if (!context) return false;
    if (!await resumeAudioContextIfNeeded(context)) return false;
    try { playSilenceBuffer(context); } catch { /* capability fallback */ }
    this.unlocked = true; this.reunlockRequired = false;
    if (this.pendingEnvelopeDrawOutPulse) {
      this.pendingEnvelopeDrawOutPulse = false;
      this.envelopeDrawOutPlayedForGesture = false;
      this.envelopeDrawOutPulse();
    }
    return true;
  }
  handleAudioInterruption(phase: 'begin' | 'end'): void { if (phase === 'begin') { this.unlocked = false; this.reunlockRequired = true; this.stopBgm(); this.resetEnvelopeDrawOutGesture(); } }
  handleAppVisibilityChange(visible: boolean): void { if (!visible) this.stopBgm(); else if (this.unlocked) this.startBgm(); }
  /** 注入随包「信纸抽出」素材字节；返回前不做任何解码，保持音频上下文惰性创建。 */
  setEnvelopeDrawOutSample(bytes: ArrayBuffer | null): void {
    this.envelopeDrawOutBytes = bytes;
    this.envelopeDrawOutBuffer = null;
    this.envelopeDrawOutDecodeFailed = false;
  }
  /** 抽信手势第一次产生有效位移时播放随包抽出素材，后续移动不重复触发；素材缺失/解码失败时静默，无合成回退。 */
  envelopeDrawOutPulse(): void {
    if (this.envelopeDrawOutPlayedForGesture) return;
    this.envelopeDrawOutPlayedForGesture = true;
    if (!this.unlocked) { this.pendingEnvelopeDrawOutPulse = true; return; }
    this.playEnvelopeDrawOutSample();
  }
  /** 手势结束（松手/回弹）后复位一次性触发标记；素材自然播完，不截断尾音。 */
  resetEnvelopeDrawOutGesture(): void {
    this.pendingEnvelopeDrawOutPulse = false;
    this.envelopeDrawOutPlayedForGesture = false;
  }
  /** 等待“补播 + 解码 + 调度播放”结算；无待处理时立即返回。离线渲染测试用其消除解码竞态。 */
  async whenEnvelopeDrawOutSettled(): Promise<void> {
    while (this.pendingEnvelopeDrawOutPulse || this.envelopeDrawOutDecoding) {
      const pending = this.envelopeDrawOutDecoding ?? Promise.resolve();
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  private playEnvelopeDrawOutSample(): void {
    const context = this.ensurePipeline(); if (!context || !this.sfxBus) return;
    if (this.envelopeDrawOutBuffer) {
      this.startEnvelopeDrawOutSource(context);
      return;
    }
    if (!this.envelopeDrawOutBytes || this.envelopeDrawOutDecodeFailed) return;
    // 首次发声时解码并缓存；解码会转移字节所有权，失败后标记不再重试
    const bytes = this.envelopeDrawOutBytes;
    this.envelopeDrawOutBytes = null;
    this.envelopeDrawOutDecoding = context.decodeAudioData(bytes)
      .then((buffer) => {
        this.envelopeDrawOutBuffer = buffer;
        this.startEnvelopeDrawOutSource(context);
      })
      .catch(() => { this.envelopeDrawOutDecodeFailed = true; })
      .finally(() => { this.envelopeDrawOutDecoding = null; });
  }
  private startEnvelopeDrawOutSource(context: BaseAudioContext): void {
    if (!this.sfxBus || !this.envelopeDrawOutBuffer) return;
    const source = context.createBufferSource();
    source.buffer = this.envelopeDrawOutBuffer;
    source.connect(this.sfxBus);
    source.start();
  }
  ignite(): void {
    if (!this.unlocked) return; const context = this.ensurePipeline(); if (!context || !this.sfxBus) return; const noise = this.noiseBuffer(context); if (!noise) return;
    scheduleIgnition(context, this.sfxBus, noise, context.currentTime, AUDIO_SYNTHESIS_PARAMETERS.ignition); scheduleBurningNoise(context, this.sfxBus, noise, context.currentTime, AUDIO_SYNTHESIS_PARAMETERS.burn);
  }
  extinguish(): void {
    if (!this.unlocked) return; const context = this.ensurePipeline(); if (!context || !this.sfxBus) return; const noise = this.noiseBuffer(context); if (!noise) return;
    scheduleExtinguish(context, this.sfxBus, noise, context.currentTime, AUDIO_SYNTHESIS_PARAMETERS.extinguish);
    if (this.bgmDry && this.bgmWet) scheduleGenerativePianoNote(context, this.bgmDry, this.bgmWet, { startAtSeconds: context.currentTime, frequencyHertz: midiNoteToFrequencyHertz(52), velocity: 0.28, durationSeconds: 2.2, layer: 'chord' });
  }
  startBgm(): void {
    const context = this.ensurePipeline(); if (!this.unlocked || !context || !this.bgmBus || this.bgmPlaying) return;
    const now = context.currentTime; this.bgmBus.gain.cancelScheduledValues(now); this.bgmBus.gain.setValueAtTime(this.bgmBus.gain.value, now); this.bgmBus.gain.linearRampToValueAtTime(AUDIO_SYNTHESIS_PARAMETERS.bgm.bgmBusGain, now + AUDIO_SYNTHESIS_PARAMETERS.bgm.fadeInSeconds);
    if (!this.bgmDry || !this.bgmWet) { const chain = createBgmReverbChain(context, this.bgmBus); this.bgmDry = chain.dryInputNode; this.bgmWet = chain.wetSendInputNode; }
    this.planner = createGenerativePianoPlanner(AUDIO_SYNTHESIS_PARAMETERS.bgm.seed, AUDIO_SYNTHESIS_PARAMETERS.bgm); this.bgmOrigin = now; this.bgmPlaying = true; this.updateBgm();
  }
  updateBgm(): void {
    if (!this.bgmPlaying || !this.planner || !this.context || !this.bgmDry || !this.bgmWet) return;
    for (const event of this.planner.planNextEvents(this.context.currentTime + 6 - this.bgmOrigin)) scheduleGenerativePianoNote(this.context, this.bgmDry, this.bgmWet, { ...event, startAtSeconds: event.startAtSeconds + this.bgmOrigin });
  }
  stopBgm(): void {
    this.bgmPlaying = false; this.planner = null; if (!this.context || !this.bgmBus) return; const now = this.context.currentTime; this.bgmBus.gain.cancelScheduledValues(now); this.bgmBus.gain.setValueAtTime(this.bgmBus.gain.value, now); this.bgmBus.gain.linearRampToValueAtTime(0, now + AUDIO_SYNTHESIS_PARAMETERS.bgm.fadeOutSeconds);
  }
}
