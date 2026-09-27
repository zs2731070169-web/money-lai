/**
 * 夜间呈现门控（sleep-mode 规格「夜间反馈静默」）。
 *
 * 晚安会话中：里程碑庆祝、皮肤解锁/成就轻提示、连抽音高上行全静默——
 * 但判定本身（计数、解锁写入、图鉴录入）照常发生，仅呈现被门控。
 * 常规交互反馈（开合音/触觉、抽钞音/触觉）夜间不静默，走软化音量与触觉降档。
 */

/** 可被夜间静默的全部呈现反馈类型（新增类型必须显式进 switch，exhaustiveness 编译期锁死） */
export type PresentableFeedback =
  /** 里程碑：捆扎成捆动效 + 木质 milestone 音效 + 强化触觉 */
  | 'milestone-celebration'
  /** 皮肤解锁轻提示浮层 */
  | 'skin-unlock-toast'
  /** 成就达成轻提示浮层 */
  | 'achievement-toast'
  /** 连抽纸币音效的音高缓慢上行 */
  | 'consecutive-draw-pitch-rise';

/** 触觉档位（与平台三档对齐的内核镜像，避免 core 依赖平台类型） */
export type PresentationHapticTier = 'light' | 'medium' | 'strong';

export interface PresentationDecision {
  /** 是否呈现该反馈（false = 完全静默，音效/触觉/浮层均不发射） */
  present: boolean;
  /** 实际触觉档位；被静默的反馈无触觉（null） */
  hapticTier: PresentationHapticTier | null;
}

/** 全部呈现反馈类型的穷举清单（与联合类型一一对应，测试穷举用） */
export const ALL_PRESENTABLE_FEEDBACK_TYPES: readonly PresentableFeedback[] = [
  'milestone-celebration',
  'skin-unlock-toast',
  'achievement-toast',
  'consecutive-draw-pitch-rise',
];

/** 呈现门控：日间全通过；夜间四类全静默（sleep-mode 规格） */
export function resolvePresentationDecision(
  feedback: PresentableFeedback,
  isBedtimeSession: boolean,
  requestedHapticTier: PresentationHapticTier,
): PresentationDecision {
  if (!isBedtimeSession) {
    return { present: true, hapticTier: requestedHapticTier };
  }
  switch (feedback) {
    case 'milestone-celebration':
    case 'skin-unlock-toast':
    case 'achievement-toast':
    case 'consecutive-draw-pitch-rise':
      // 夜间反馈静默：无动效、无音效、无触觉、无提示浮层
      return { present: false, hapticTier: null };
  }
}

/** 常规交互触觉的夜间降档：夜间一律最轻档（sleep-mode「夜间交互剖面」），日间原样 */
export function resolveSessionHapticTier(
  requestedTier: PresentationHapticTier,
  isBedtimeSession: boolean,
): PresentationHapticTier {
  return isBedtimeSession ? 'light' : requestedTier;
}
