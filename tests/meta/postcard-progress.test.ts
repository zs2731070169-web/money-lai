import { describe, expect, it } from 'vitest';
import { LETTER_ACHIEVEMENTS, evaluateAchievementIds } from '../../src/core/meta/postcard-progress';

describe('明信片本机元进程', () => {
  it('成就只使用燃信累计条件', () => {
    const ids = evaluateAchievementIds({ mileage: 10, drewCard: true });
    expect(ids).toEqual(['first-draw', 'first-burn', 'mileage-10']);
  });

  it('成就目录不含已退役的空白留白成就', () => {
    expect(LETTER_ACHIEVEMENTS.map((achievement) => achievement.id)).not.toContain('first-blank');
  });
});
