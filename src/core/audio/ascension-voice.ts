/**
 * 放飞声部（worry-release 规格「放飞声部」）：一次成段的轻气流 + 五声琶音收束。
 * 治愈纪律：琶音为 triangle 纯谐音 + 低通（偏暗收敛），气流为宽带噪声渐入无瞬态；
 * 无持续声床、无循环段落，总时长约 1.5-2.5s。
 */

import { AudioSynthesisParameters, AUDIO_SYNTHESIS_PARAMETERS } from './parameters';
import { midiNoteToFrequencyHertz } from './bgm-planner';

/** 放飞声部参数块（集中快照，调音必改快照测试） */
export type AscensionVoiceParameters = AudioSynthesisParameters['ascensionVoice'];

/**
 * 调度一次放飞声部（确定性：无随机源，离线渲染可回归）。
 * 气流复用共享白噪 buffer；琶音逐音错峰、指数衰减尾巴。
 */
export function scheduleAscensionVoice(
  audioContext: BaseAudioContext,
  destinationNode: AudioNode,
  sharedNoiseBuffer: AudioBuffer | null,
  parameters: AscensionVoiceParameters = AUDIO_SYNTHESIS_PARAMETERS.ascensionVoice,
  startAtSeconds = audioContext.currentTime,
): void {
  // 气流层：噪声 → 高通/低通 → 渐入长尾包络（单次、无循环段落感）
  if (sharedNoiseBuffer) {
    const noiseSourceNode = audioContext.createBufferSource();
    noiseSourceNode.buffer = sharedNoiseBuffer;
    noiseSourceNode.loop = true;
    const breathHighpassFilter = audioContext.createBiquadFilter();
    breathHighpassFilter.type = 'highpass';
    breathHighpassFilter.frequency.value = parameters.breathHighpassHertz;
    const breathLowpassFilter = audioContext.createBiquadFilter();
    breathLowpassFilter.type = 'lowpass';
    breathLowpassFilter.frequency.value = parameters.breathLowpassHertz;
    const breathGainNode = audioContext.createGain();
    const breathAttackSeconds = parameters.breathAttackMilliseconds / 1000;
    const breathTotalSeconds =
      (parameters.breathAttackMilliseconds + parameters.breathDecayMilliseconds) / 1000;
    breathGainNode.gain.setValueAtTime(0, startAtSeconds);
    breathGainNode.gain.linearRampToValueAtTime(parameters.breathPeakGain, startAtSeconds + breathAttackSeconds);
    breathGainNode.gain.linearRampToValueAtTime(0, startAtSeconds + breathTotalSeconds);
    noiseSourceNode.connect(breathHighpassFilter);
    breathHighpassFilter.connect(breathLowpassFilter);
    breathLowpassFilter.connect(breathGainNode);
    breathGainNode.connect(destinationNode);
    noiseSourceNode.start(startAtSeconds);
    noiseSourceNode.stop(startAtSeconds + breathTotalSeconds + 0.05);
  }

  // 五声琶音：triangle 纯谐音 + 低通暗化，逐音错峰、指数衰减收束
  parameters.arpeggioMidiNotes.forEach((midiNote, noteIndex) => {
    const noteStartSeconds =
      startAtSeconds +
      (parameters.arpeggioFirstNoteDelayMilliseconds +
        noteIndex * parameters.arpeggioNoteIntervalMilliseconds) /
        1000;
    const oscillatorNode = audioContext.createOscillator();
    oscillatorNode.type = 'triangle';
    oscillatorNode.frequency.value = midiNoteToFrequencyHertz(midiNote);
    const noteLowpassFilter = audioContext.createBiquadFilter();
    noteLowpassFilter.type = 'lowpass';
    noteLowpassFilter.frequency.value = 2200;
    const noteGainNode = audioContext.createGain();
    // 毫秒级起坡（无瞬态）→ 指数衰减尾巴
    noteGainNode.gain.setValueAtTime(0, noteStartSeconds);
    noteGainNode.gain.linearRampToValueAtTime(
      parameters.arpeggioPeakGain,
      noteStartSeconds + 0.008,
    );
    noteGainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      noteStartSeconds + parameters.arpeggioNoteDurationSeconds,
    );
    oscillatorNode.connect(noteLowpassFilter);
    noteLowpassFilter.connect(noteGainNode);
    noteGainNode.connect(destinationNode);
    oscillatorNode.start(noteStartSeconds);
    oscillatorNode.stop(noteStartSeconds + parameters.arpeggioNoteDurationSeconds + 0.05);
  });
}
