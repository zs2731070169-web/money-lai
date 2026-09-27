import { createSeededRandomNumberGenerator } from '../utility/deterministic-random';

/**
 * 生成式钢琴 BGM 计划器（实测反馈迭代：音调不再单一）。
 *
 * 结构：慢速和弦进行（Cmaj7→Am7→Fmaj7→G6）之上两层——
 * ① 伴奏层 = 分解和弦（低音根音 + 慢琶音，衰减式钢琴音，无持续铺底 → 消除「滴滴」底噪）
 * ② 旋律层 = 五声音阶乐句化行走（方向偏置每 8 音翻转、偶发八度跳跃、偏态间隔含长呼吸）
 * 种子驱动确定性：同种子重放一致、异种子不重复。
 */

export interface GenerativePianoNoteEvent {
  /** 计划器时间线上的起始时刻（秒） */
  startAtSeconds: number;
  frequencyHertz: number;
  /** 力度 0~1 */
  velocity: number;
  durationSeconds: number;
  layer: 'melody' | 'chord';
}

export interface GenerativePianoPlannerParameters {
  chordDurationSeconds: number;
  melodyMinIntervalSeconds: number;
  melodyMaxIntervalSeconds: number;
}

/** 和弦进行（MIDI 音符，低中区） */
const BGM_CHORD_PROGRESSION_MIDI: number[][] = [
  [48, 55, 59, 62], // Cmaj7
  [45, 52, 55, 60], // Am7
  [41, 48, 53, 57], // Fmaj7
  [43, 50, 52, 55], // G6
];

/** 旋律音阶：C 大调五声音阶跨两个八度，恢复原版 C5~A5（实测反馈 v2.5：只压最高音，不移调） */
export const MELODY_SCALE_MIDI = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];

/** 高音顶棚（MIDI）：发声音高超过 C5 的旋律音符下折一个八度（高音柔化） */
export const MELODY_CEILING_MIDI = 72;

/** 分解和弦伴奏型：低音根音起拍 + 5 个慢琶音（toneIndex 对应和弦内音，octaveShift 为 ±12） */
interface ChordArpeggioStep {
  offsetSeconds: number;
  toneIndex: number;
  octaveShift: number;
  velocity: number;
  durationSeconds: number;
}

const CHORD_ARPEGGIO_PATTERN: ChordArpeggioStep[] = [
  { offsetSeconds: 0.0, toneIndex: 0, octaveShift: -1, velocity: 0.34, durationSeconds: 6.5 }, // 低音根音
  { offsetSeconds: 0.7, toneIndex: 2, octaveShift: 0, velocity: 0.22, durationSeconds: 4.5 },
  { offsetSeconds: 2.1, toneIndex: 3, octaveShift: 0, velocity: 0.2, durationSeconds: 4.5 },
  { offsetSeconds: 3.5, toneIndex: 1, octaveShift: 1, velocity: 0.19, durationSeconds: 4.0 },
  { offsetSeconds: 5.6, toneIndex: 2, octaveShift: 0, velocity: 0.16, durationSeconds: 4.0 },
  { offsetSeconds: 7.4, toneIndex: 3, octaveShift: 1, velocity: 0.14, durationSeconds: 3.5 },
];

/** 琶音步的时机抖动上限（秒）：固定 pattern 加入呼吸感 */
const ARPEGGIO_TIMING_JITTER_SECONDS = 0.25;

export function midiNoteToFrequencyHertz(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export interface GenerativePianoPlanner {
  /** 计划 (已计划终点, untilSeconds] 的增量事件并推进游标（幂等） */
  planNextEvents(untilSeconds: number): GenerativePianoNoteEvent[];
  get plannedUntilSeconds(): number;
}

export function createGenerativePianoPlanner(
  seed: number,
  parameters: GenerativePianoPlannerParameters,
): GenerativePianoPlanner {
  const nextRandomDouble = createSeededRandomNumberGenerator(seed);
  let plannedUntilSeconds = 0;
  let scheduledChordCount = 0;
  let melodyCursorSeconds = 0;
  let melodyScaleIndex = 4; // 原音阶下标 4 = 67（G4，行走进点）
  let melodyNoteCount = 0;

  return {
    get plannedUntilSeconds() {
      return plannedUntilSeconds;
    },

    planNextEvents(untilSeconds: number): GenerativePianoNoteEvent[] {
      const events: GenerativePianoNoteEvent[] = [];

      // 伴奏层：分解和弦（游标按和弦槽推进，幂等）
      while (scheduledChordCount * parameters.chordDurationSeconds < untilSeconds) {
        const chordStartSeconds = scheduledChordCount * parameters.chordDurationSeconds;
        const chordMidiNotes =
          BGM_CHORD_PROGRESSION_MIDI[
            scheduledChordCount % BGM_CHORD_PROGRESSION_MIDI.length
          ];
        for (const arpeggioStep of CHORD_ARPEGGIO_PATTERN) {
          // 低音根音锁定节拍（不抖动），其余琶音步带小抖动
          const timingJitterSeconds =
            arpeggioStep.offsetSeconds === 0
              ? 0
              : (nextRandomDouble() * 2 - 1) * ARPEGGIO_TIMING_JITTER_SECONDS;
          events.push({
            startAtSeconds: Math.max(
              0,
              chordStartSeconds + arpeggioStep.offsetSeconds + timingJitterSeconds,
            ),
            frequencyHertz: midiNoteToFrequencyHertz(
              chordMidiNotes[arpeggioStep.toneIndex] + arpeggioStep.octaveShift * 12,
            ),
            velocity: arpeggioStep.velocity * (0.92 + nextRandomDouble() * 0.16),
            durationSeconds: arpeggioStep.durationSeconds,
            layer: 'chord',
          });
        }
        scheduledChordCount += 1;
      }

      // 旋律层：乐句化五声音阶行走
      // 方向偏置：每 8 个音翻转（升句↔降句交替，旋律有起伏而非原地徘徊）
      while (melodyCursorSeconds < untilSeconds) {
        const phraseDirection = Math.floor(melodyNoteCount / 8) % 2 === 0 ? 1 : -1;
        let scaleStep: number;
        if (nextRandomDouble() < 0.12) {
          // 偶发八度跳跃：瞬间 ±5~6 档（仍在音阶内）
          scaleStep = (5 + Math.floor(nextRandomDouble() * 2)) * phraseDirection;
        } else {
          // 常规步进：方向偏置下的 1~2 档
          scaleStep = (1 + Math.floor(nextRandomDouble() * 2)) * phraseDirection;
          if (nextRandomDouble() < 0.2) scaleStep *= -1; // 少量逆向点缀
        }
        const previousIndex = melodyScaleIndex;
        melodyScaleIndex = Math.min(
          MELODY_SCALE_MIDI.length - 1,
          Math.max(0, melodyScaleIndex + scaleStep),
        );
        // 越界钳制后原地重复时，强制换个方向（避免同音卡死）
        if (melodyScaleIndex === previousIndex) {
          melodyScaleIndex = Math.min(
            MELODY_SCALE_MIDI.length - 1,
            Math.max(0, melodyScaleIndex - phraseDirection * 2),
          );
        }

        // 高音顶棚折下：游标按原音阶行走（轮廓不变），仅发声音高折叠（实测 v2.5）
        const walkedMidiNote = MELODY_SCALE_MIDI[melodyScaleIndex];
        const soundedMidiNote =
          walkedMidiNote > MELODY_CEILING_MIDI ? walkedMidiNote - 12 : walkedMidiNote;
        events.push({
          startAtSeconds: melodyCursorSeconds,
          frequencyHertz: midiNoteToFrequencyHertz(soundedMidiNote),
          velocity: 0.42 + nextRandomDouble() * 0.28,
          durationSeconds: 2.2 + nextRandomDouble() * 2.2,
          layer: 'melody',
        });
        melodyNoteCount += 1;

        // 间隔偏态分布：多数 1~2s（密），偶发到 max（长呼吸）
        melodyCursorSeconds +=
          parameters.melodyMinIntervalSeconds +
          Math.pow(nextRandomDouble(), 2.2) *
            (parameters.melodyMaxIntervalSeconds - parameters.melodyMinIntervalSeconds);
      }

      plannedUntilSeconds = Math.max(plannedUntilSeconds, untilSeconds);
      return events.sort((first, second) => first.startAtSeconds - second.startAtSeconds);
    },
  };
}
