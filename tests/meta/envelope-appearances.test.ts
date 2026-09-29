import { describe, expect, it } from 'vitest';
import { activateAppearance, createEmptyLetterBurningState } from '../../src/core/journal/journal-state';

describe('信封与纸纹双槽', () => {
  it('两个启用位互不覆盖，未解锁项不可启用', () => {
    const initial = { ...createEmptyLetterBurningState(), unlockedAppearanceIds: ['envelope-kraft', 'paper-plain', 'envelope-rose', 'paper-fiber'] };
    const envelope = activateAppearance(initial, 'envelope-rose');
    const both = activateAppearance(envelope, 'paper-fiber');
    expect(both.activeEnvelopeAppearanceId).toBe('envelope-rose');
    expect(both.activePaperAppearanceId).toBe('paper-fiber');
    expect(activateAppearance(both, 'envelope-night')).toBe(both);
  });
});
