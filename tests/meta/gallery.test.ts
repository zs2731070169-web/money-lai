import { describe, expect, it } from 'vitest';
import { CASH_DENOMINATIONS } from '../../src/core/cash/denomination';
import {
  createInitialPersistedGameState,
  parsePersistedGameState,
  serializePersistedGameState,
} from '../../src/core/meta/game-state';
import {
  getGalleryEntries,
  recordDenominationFirstDraw,
} from '../../src/core/meta/gallery';

/**
 * 钞票图鉴单测（任务 4.1 验证入口，对应 meta-progression 规格「钞票图鉴」）：
 * 首抽录入、占位/完整两态、图鉴数据随进度持久化。
 */

describe('图鉴录入', () => {
  it('某面额首次抽出 → 录入图鉴并标记为首次', () => {
    const initialState = createInitialPersistedGameState();
    const recordUpdate = recordDenominationFirstDraw(initialState, 'denomination-100', 42);
    expect(recordUpdate.isFirstDraw).toBe(true);
    expect(recordUpdate.state.gallery['denomination-100']).toBe(42);
  });

  it('同一面额再次抽出 → 不重复录入', () => {
    const initialState = createInitialPersistedGameState();
    const firstDraw = recordDenominationFirstDraw(initialState, 'denomination-5', 7);
    const secondDraw = recordDenominationFirstDraw(firstDraw.state, 'denomination-5', 20);
    expect(secondDraw.isFirstDraw).toBe(false);
    expect(secondDraw.state.gallery['denomination-5']).toBe(7);
  });

  it('图鉴数据经持久化往返保留', () => {
    const initialState = createInitialPersistedGameState();
    const recorded = recordDenominationFirstDraw(initialState, 'denomination-50', 13).state;
    const roundTripped = parsePersistedGameState(serializePersistedGameState(recorded));
    expect(roundTripped.resetToInitial).toBe(false);
    expect(roundTripped.state.gallery['denomination-50']).toBe(13);
  });
});

describe('图鉴展示（占位/完整两态）', () => {
  it('空图鉴：全部面额为未收集占位', () => {
    const entries = getGalleryEntries(createInitialPersistedGameState());
    expect(entries.length).toBe(CASH_DENOMINATIONS.length);
    expect(entries.every((entry) => entry.collected === false)).toBe(true);
  });

  it('收集两个面额后：对应条目完整、其余仍为占位', () => {
    let state = createInitialPersistedGameState();
    state = recordDenominationFirstDraw(state, 'denomination-1', 0).state;
    state = recordDenominationFirstDraw(state, 'denomination-10', 5).state;
    const entries = getGalleryEntries(state);
    const collectedIds = entries.filter((entry) => entry.collected).map((entry) => entry.denominationId);
    expect(collectedIds.sort()).toEqual(['denomination-1', 'denomination-10']);
    expect(entries.find((entry) => entry.denominationId === 'denomination-1')?.firstDrawnAtDrawIndex).toBe(0);
  });
});
