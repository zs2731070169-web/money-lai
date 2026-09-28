import { createSeededRandomNumberGenerator } from '../utility/deterministic-random';
import { createGenerativePianoPlanner, midiNoteToFrequencyHertz, type GenerativePianoPlanner } from './bgm-planner';
import { createBgmReverbChain, scheduleGenerativePianoNote } from './bgm-player';
import { scheduleBurningNoise, scheduleExtinguish, scheduleIgnition, startPostcardRustle, stopNoiseVoice, type ActiveNoiseVoice } from './fire-sound';
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
  private rustle: ActiveNoiseVoice | null = null;
  private unlocked = false;
  private reunlockRequired = false;
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
    this.unlocked = true; this.reunlockRequired = false; return true;
  }
  handleAudioInterruption(phase: 'begin' | 'end'): void { if (phase === 'begin') { this.unlocked = false; this.reunlockRequired = true; this.stopBgm(); this.stopRustle(); } }
  handleAppVisibilityChange(visible: boolean): void { if (!visible) this.stopBgm(); else if (this.unlocked) this.startBgm(); }
  startRustle(): void {
    if (!this.unlocked || this.rustle) return; const context = this.ensurePipeline(); if (!context || !this.sfxBus) return; const noise = this.noiseBuffer(context); if (!noise) return;
    this.rustle = startPostcardRustle(context, this.sfxBus, noise, context.currentTime, AUDIO_SYNTHESIS_PARAMETERS.postcardRustle);
  }
  stopRustle(): void {
    if (!this.rustle || !this.context) return; stopNoiseVoice(this.rustle, this.context.currentTime, AUDIO_SYNTHESIS_PARAMETERS.postcardRustle.fadeOutSeconds); this.rustle = null;
  }
  ignite(): void {
    if (!this.unlocked) return; const context = this.ensurePipeline(); if (!context || !this.sfxBus) return; const noise = this.noiseBuffer(context); if (!noise) return;
    this.stopRustle(); scheduleIgnition(context, this.sfxBus, noise, context.currentTime, AUDIO_SYNTHESIS_PARAMETERS.ignition); scheduleBurningNoise(context, this.sfxBus, noise, context.currentTime, AUDIO_SYNTHESIS_PARAMETERS.burn);
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
