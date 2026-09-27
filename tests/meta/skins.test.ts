import { describe, expect, it } from 'vitest';
import {
  createInitialPersistedGameState,
  parsePersistedGameState,
  serializePersistedGameState,
} from '../../src/core/meta/game-state';
import {
  SKIN_COLLECTION,
  evaluateSkinUnlocks,
  isSkinUnlocked,
  switchActiveSkin,
} from '../../src/core/meta/skins';

/**
 * 皮肤解锁与切换单测（任务 4.2 验证入口，对应 meta-progression 规格「皮肤解锁」）：
 * 8-12 款阈值梯度、解锁不改计数、activeSkin 持久化、未解锁不可切换。
 */

describe('皮肤表', () => {
  it('总合集 8-12 款且含默认款（解锁阈值 0）', () => {
    expect(SKIN_COLLECTION.length).toBeGreaterThanOrEqual(8);
    expect(SKIN_COLLECTION.length).toBeLessThanOrEqual(12);
    const defaultSkins = SKIN_COLLECTION.filter((skin) => skin.unlockAtDrawCount === 0);
    expect(defaultSkins.length).toBe(1);
  });

  it('解锁阈值单调不重复', () => {
    const thresholds = SKIN_COLLECTION.map((skin) => skin.unlockAtDrawCount).sort((a, b) => a - b);
    expect(new Set(thresholds).size).toBe(thresholds.length);
  });
});

describe('皮肤解锁', () => {
  it('lifetimeDrawCount 达标 → 解锁并报告新解锁项', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 50;
    const unlockUpdate = evaluateSkinUnlocks(initialState);
    expect(unlockUpdate.state.unlockedSkins).toContain('wallet-caramel');
    expect(unlockUpdate.newlyUnlocked.map((skin) => skin.id)).toContain('wallet-caramel');
  });

  it('重复评估不重复解锁（幂等）', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 100;
    const firstEvaluation = evaluateSkinUnlocks(initialState);
    const secondEvaluation = evaluateSkinUnlocks(firstEvaluation.state);
    expect(secondEvaluation.newlyUnlocked).toEqual([]);
  });

  it('解锁不改动累计计数（皮肤切换不影响计数与判定，规格）', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 777;
    const unlockUpdate = evaluateSkinUnlocks(initialState);
    expect(unlockUpdate.state.lifetimeDrawCount).toBe(777);
  });
});

describe('皮肤切换（分组双槽）', () => {
  it('钱包皮换钱包槽，纸币槽不受影响', () => {
    let state = createInitialPersistedGameState();
    state.lifetimeDrawCount = 200;
    state = evaluateSkinUnlocks(state).state;
    state = switchActiveSkin(state, 'bill-sage');
    state = switchActiveSkin(state, 'wallet-moss');
    expect(state.activeWalletSkin).toBe('wallet-moss');
    // 钱包切换不覆盖纸币槽：两类皮肤同时生效
    expect(state.activeBillSkin).toBe('bill-sage');
  });

  it('纸纹皮换纸币槽且持久化往返一致', () => {
    let state = createInitialPersistedGameState();
    state.lifetimeDrawCount = 100;
    state = evaluateSkinUnlocks(state).state;
    state = switchActiveSkin(state, 'bill-sage');
    expect(state.activeBillSkin).toBe('bill-sage');
    const roundTripped = parsePersistedGameState(serializePersistedGameState(state));
    expect(roundTripped.state.activeBillSkin).toBe('bill-sage');
  });

  it('再选已启用的纸纹皮 → 恢复纸币原色，钱包槽不受影响', () => {
    let state = createInitialPersistedGameState();
    state.lifetimeDrawCount = 600;
    state = evaluateSkinUnlocks(state).state;
    state = switchActiveSkin(state, 'wallet-dusk');
    state = switchActiveSkin(state, 'bill-sage');
    state = switchActiveSkin(state, 'bill-sage'); // 再选取消染色
    expect(state.activeBillSkin).toBeNull();
    expect(state.activeWalletSkin).toBe('wallet-dusk');
  });

  it('未解锁皮肤切换被拒绝（状态不变）', () => {
    const initialState = createInitialPersistedGameState();
    const attemptedState = switchActiveSkin(initialState, 'bill-aurum');
    expect(attemptedState.activeWalletSkin).toBe(initialState.activeWalletSkin);
    expect(attemptedState.activeBillSkin).toBe(initialState.activeBillSkin);
  });

  it('isSkinUnlocked 反映解锁状态', () => {
    let state = createInitialPersistedGameState();
    expect(isSkinUnlocked(state, 'wallet-classic')).toBe(true);
    expect(isSkinUnlocked(state, 'wallet-caramel')).toBe(false);
    state.lifetimeDrawCount = 50;
    state = evaluateSkinUnlocks(state).state;
    expect(isSkinUnlocked(state, 'wallet-caramel')).toBe(true);
  });
});
