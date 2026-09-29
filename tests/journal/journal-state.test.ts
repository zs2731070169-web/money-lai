import { describe, expect, it } from 'vitest';
import {
  LETTER_BURNING_STORAGE_KEY, activateFontPackage, clearJournal, createEmptyLetterLetterState,
  parseLetterLetterState, serializeLetterLetterState, settleCompletedPostcard,
} from '../../src/core/journal/journal-state';

describe('燃信本地状态', () => {
  it('使用新键，损坏数据与旧钱包数据不会迁移', () => {
    expect(LETTER_BURNING_STORAGE_KEY).toBe('letter-burning/state/v1');
    expect(parseLetterLetterState('{bad')).toEqual(createEmptyLetterLetterState());
    expect(parseLetterLetterState(JSON.stringify({ version: 0, lifetimeDrawCount: 999 }))).toEqual(createEmptyLetterLetterState());
  });

  it('有字与空白记录按写入顺序持久化往返', () => {
    let state = createEmptyLetterLetterState();
    state = settleCompletedPostcard(state, { id: 'a', createdAtIso: '2026-09-28T01:00:00.000Z', patternId: 'postcard-01', text: '原文' });
    state = settleCompletedPostcard(state, { id: 'b', createdAtIso: '2026-09-28T02:00:00.000Z', patternId: 'postcard-02', text: '' });
    expect(parseLetterLetterState(serializeLetterLetterState(state))).toEqual(state);
    expect(state.journalEntries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('清空只移除手帐和图鉴，保留里程、外观、成就和节奏', () => {
    const completed = settleCompletedPostcard(createEmptyLetterLetterState(), { id: 'a', createdAtIso: '2026-09-28T01:00:00.000Z', patternId: 'postcard-01', text: '' });
    const cleared = clearJournal(completed);
    expect(cleared.journalEntries).toEqual([]);
    expect(cleared.collectedPatternIds).toEqual([]);
    expect(cleared.postcardMileage).toBe(1);
    expect(cleared.achievementIds.length).toBeGreaterThan(0);
    expect(cleared.statCadenceCount).toBe(1);
  });

  it('字体套餐选择可持久化且未知值回退', () => {
    const selected = activateFontPackage(createEmptyLetterLetterState(), 'romantic-literary');
    expect(parseLetterLetterState(serializeLetterLetterState(selected)).activeFontPackageId).toBe('romantic-literary');
    expect(parseLetterLetterState(JSON.stringify({ ...selected, activeFontPackageId: 'missing' })).activeFontPackageId).toBe('warm-handwriting');
  });
});
