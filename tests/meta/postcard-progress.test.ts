import { describe, expect, it } from 'vitest';
import { evaluateAchievementIds } from '../../src/core/meta/postcard-progress';

describe('明信片本机元进程', () => {
  it('成就只使用燃信累计条件', () => {
    const ids = evaluateAchievementIds({ mileage: 10, completedBlank: true, drewCard: true });
    expect(ids).toEqual(['first-draw', 'first-burn', 'first-blank', 'mileage-10']);
  });
});
