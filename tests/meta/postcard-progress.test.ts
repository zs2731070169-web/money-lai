import { describe, expect, it } from 'vitest';
import { APPEARANCES, evaluateAchievementIds, isAppearanceUnlocked } from '../../src/core/meta/postcard-progress';

describe('明信片本机元进程', () => {
  it('提供信封与纸纹双槽共八种外观并按里程解锁', () => {
    expect(APPEARANCES).toHaveLength(8);
    expect(APPEARANCES.filter((item) => item.kind === 'envelope')).toHaveLength(4);
    expect(APPEARANCES.filter((item) => item.kind === 'paper')).toHaveLength(4);
    expect(isAppearanceUnlocked('envelope-rose', 2)).toBe(false);
    expect(isAppearanceUnlocked('envelope-rose', 3)).toBe(true);
  });

  it('成就只使用燃信累计条件', () => {
    const ids = evaluateAchievementIds({ mileage: 10, collectedPatternIds: Array.from({ length: 6 }, (_, index) => `postcard-0${index + 1}`), completedBlank: true, drewCard: true });
    expect(ids).toEqual(expect.arrayContaining(['first-draw', 'first-burn', 'first-blank', 'patterns-6', 'mileage-10']));
  });
});

