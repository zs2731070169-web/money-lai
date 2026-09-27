import { CASH_DENOMINATIONS } from '../cash/denomination';
import { PersistedGameStateV1 } from './game-state';

/**
 * 累计成就（meta-progression 规格「累计成就」）：
 * 全部为累计型（首抽/累计张数/图鉴集齐），无限时、无竞赛、无失败型。
 */

export type AchievementCondition =
  | { type: 'first-draw' }
  | { type: 'draw-count'; threshold: number }
  | { type: 'gallery-complete' };

export interface AchievementDefinition {
  id: string;
  condition: AchievementCondition;
  displayName: string;
}

export const ACHIEVEMENT_COLLECTION: AchievementDefinition[] = [
  { id: 'first-draw', condition: { type: 'first-draw' }, displayName: '第一张来钱' },
  { id: 'draw-count-100', condition: { type: 'draw-count', threshold: 100 }, displayName: '百张之约' },
  { id: 'draw-count-1000', condition: { type: 'draw-count', threshold: 1000 }, displayName: '千张绵延' },
  { id: 'draw-count-10000', condition: { type: 'draw-count', threshold: 10000 }, displayName: '万张长流' },
  { id: 'gallery-complete', condition: { type: 'gallery-complete' }, displayName: '图鉴集齐' },
];

export interface AchievementEvaluation {
  state: PersistedGameStateV1;
  /** 本次评估新达成的成就 id（供非侵入轻提示消费） */
  newlyAchieved: string[];
}

function isAchievementConditionMet(
  achievement: AchievementDefinition,
  state: PersistedGameStateV1,
  collectedDenominationCount: number,
): boolean {
  switch (achievement.condition.type) {
    case 'first-draw':
      return state.lifetimeDrawCount >= 1;
    case 'draw-count':
      return state.lifetimeDrawCount >= achievement.condition.threshold;
    case 'gallery-complete':
      // 图鉴集齐：全部面额均已录入
      return collectedDenominationCount >= CASH_DENOMINATIONS.length;
  }
}

export function evaluateAchievements(state: PersistedGameStateV1): AchievementEvaluation {
  const collectedDenominationCount = Object.keys(state.gallery).length;

  const achievedIds = new Set(state.achievements);
  const newlyAchieved: string[] = [];
  for (const achievement of ACHIEVEMENT_COLLECTION) {
    if (
      !achievedIds.has(achievement.id) &&
      isAchievementConditionMet(achievement, state, collectedDenominationCount)
    ) {
      achievedIds.add(achievement.id);
      newlyAchieved.push(achievement.id);
    }
  }
  if (newlyAchieved.length === 0) {
    return { state, newlyAchieved: [] };
  }
  return {
    state: { ...state, achievements: Array.from(achievedIds) },
    newlyAchieved,
  };
}
