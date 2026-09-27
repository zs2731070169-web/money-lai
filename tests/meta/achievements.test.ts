import { describe, expect, it } from 'vitest';
import { CASH_DENOMINATIONS } from '../../src/core/cash/denomination';
import { createInitialPersistedGameState } from '../../src/core/meta/game-state';
import {
  ACHIEVEMENT_COLLECTION,
  evaluateAchievements,
} from '../../src/core/meta/achievements';

/**
 * 累计成就单测（任务 4.3 验证入口，对应 meta-progression 规格「累计成就」）：
 * 里程碑触发、幂等达成、仅累计型（无限时/竞赛/失败型）。
 */

describe('成就表', () => {
  it('全部为累计型（无限时与失败型条件）', () => {
    for (const achievement of ACHIEVEMENT_COLLECTION) {
      expect(['first-draw', 'draw-count', 'gallery-complete']).toContain(
        achievement.condition.type,
      );
    }
  });

  it('包含早期、中期与长期里程碑', () => {
    const drawCountConditions = ACHIEVEMENT_COLLECTION.flatMap((achievement) =>
      achievement.condition.type === 'draw-count' ? [achievement.condition.threshold] : [],
    );
    expect(drawCountConditions).toContain(100);
    expect(drawCountConditions).toContain(1000);
  });
});

describe('成就达成', () => {
  it('首抽即达成 first-draw 成就', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 1;
    const evaluation = evaluateAchievements(initialState);
    expect(evaluation.newlyAchieved).toContain('first-draw');
    expect(evaluation.state.achievements).toContain('first-draw');
  });

  it('累计 100 张达成对应里程碑', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 100;
    const evaluation = evaluateAchievements(initialState);
    expect(evaluation.newlyAchieved).toContain('draw-count-100');
  });

  it('图鉴集齐（全部面额已录入）达成 gallery-complete', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 30;
    CASH_DENOMINATIONS.forEach((denomination, index) => {
      initialState.gallery[denomination.id] = index;
    });
    const evaluation = evaluateAchievements(initialState);
    expect(evaluation.newlyAchieved).toContain('gallery-complete');
  });

  it('重复评估幂等（不重复达成）', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 1500;
    const firstEvaluation = evaluateAchievements(initialState);
    const secondEvaluation = evaluateAchievements(firstEvaluation.state);
    expect(secondEvaluation.newlyAchieved).toEqual([]);
    expect(secondEvaluation.state.achievements.length).toBe(
      firstEvaluation.state.achievements.length,
    );
  });

  it('未达阈值不成（99 张不达成 draw-count-100）', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 99;
    const evaluation = evaluateAchievements(initialState);
    expect(evaluation.state.achievements).not.toContain('draw-count-100');
  });
});
