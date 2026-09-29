export interface ActiveNoiseVoice { gainNode: GainNode; sourceNode: AudioBufferSourceNode; stopAtSeconds: number }

function filteredNoise(
  context: BaseAudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  highpassHertz: number,
  lowpassHertz: number,
): { source: AudioBufferSourceNode; gain: GainNode } {
  const source = context.createBufferSource(); source.buffer = noiseBuffer; source.loop = true;
  const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = highpassHertz;
  const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = lowpassHertz;
  const gain = context.createGain(); source.connect(highpass); highpass.connect(lowpass); lowpass.connect(gain); gain.connect(destination);
  return { source, gain };
}

export function stopNoiseVoice(voice: ActiveNoiseVoice, at: number, fadeSeconds: number): void {
  voice.gainNode.gain.cancelScheduledValues(at); voice.gainNode.gain.setValueAtTime(Math.max(0.0001, voice.gainNode.gain.value), at); voice.gainNode.gain.linearRampToValueAtTime(0.0001, at + fadeSeconds); voice.sourceNode.stop(at + fadeSeconds + 0.02); voice.stopAtSeconds = at + fadeSeconds + 0.02;
}

export function scheduleIgnition(
  context: BaseAudioContext, destination: AudioNode, noiseBuffer: AudioBuffer, at: number,
  parameters: { durationSeconds: number; peakGain: number; centerHertz: number },
): void {
  const source = context.createBufferSource(); source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = parameters.centerHertz; filter.Q.value = 0.8;
  const gain = context.createGain(); gain.gain.setValueAtTime(0.0001, at); gain.gain.linearRampToValueAtTime(parameters.peakGain, at + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, at + parameters.durationSeconds);
  source.connect(filter); filter.connect(gain); gain.connect(destination); source.start(at); source.stop(at + parameters.durationSeconds + 0.01);
}

export function scheduleBurningNoise(
  context: BaseAudioContext, destination: AudioNode, noiseBuffer: AudioBuffer, at: number,
  parameters: { highpassHertz: number; lowpassHertz: number; startGain: number; endGain: number; durationSeconds: number; breathingPeriodSeconds: number },
): ActiveNoiseVoice {
  const voice = filteredNoise(context, destination, noiseBuffer, parameters.highpassHertz, parameters.lowpassHertz);
  voice.gain.gain.setValueAtTime(parameters.startGain, at); voice.gain.gain.linearRampToValueAtTime(parameters.endGain, at + parameters.durationSeconds);
  const lfo = context.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 1 / parameters.breathingPeriodSeconds;
  const lfoGain = context.createGain(); lfoGain.gain.value = 0.018; lfo.connect(lfoGain); lfoGain.connect(voice.gain.gain); lfo.start(at); lfo.stop(at + parameters.durationSeconds);
  voice.source.start(at); voice.source.stop(at + parameters.durationSeconds + 0.02);
  return { gainNode: voice.gain, sourceNode: voice.source, stopAtSeconds: at + parameters.durationSeconds + 0.02 };
}

export function scheduleExtinguish(
  context: BaseAudioContext, destination: AudioNode, noiseBuffer: AudioBuffer, at: number,
  parameters: { durationSeconds: number; startGain: number; lowpassHertz: number },
): void {
  const source = context.createBufferSource(); source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = parameters.lowpassHertz;
  const gain = context.createGain(); gain.gain.setValueAtTime(parameters.startGain, at); gain.gain.exponentialRampToValueAtTime(0.0001, at + parameters.durationSeconds);
  source.connect(filter); filter.connect(gain); gain.connect(destination); source.start(at); source.stop(at + parameters.durationSeconds + 0.02);
}
