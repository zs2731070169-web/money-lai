import { describe, expect, it } from 'vitest';
import {
  createInitialPersistedGameState,
  parsePersistedGameState,
  serializePersistedGameState,
} from '../../src/core/meta/game-state';
import {
  setBgmEnabled,
  setHapticsEnabled,
  setSoundEnabled,
} from '../../src/core/meta/settings';

/**
 * 设置模型单测（任务 4.4 验证入口，对应 meta-progression 规格「设置页」）：
 * 音效/BGM/触觉三开关读写、默认开启、持久化往返、互不影响。
 */

describe('设置开关', () => {
  it('默认全部开启（晚安模式开关默认关闭，sleep-mode 规格）', () => {
    const initialState = createInitialPersistedGameState();
    expect(initialState.settings).toEqual({
      soundEnabled: true,
      bgmEnabled: true,
      hapticsEnabled: true,
      bedtimeModeEnabled: false,
    });
  });

  it('各自独立开关，互不影响', () => {
    let state = createInitialPersistedGameState();
    state = setSoundEnabled(state, false);
    expect(state.settings.soundEnabled).toBe(false);
    expect(state.settings.bgmEnabled).toBe(true);
    expect(state.settings.hapticsEnabled).toBe(true);

    state = setBgmEnabled(state, false);
    expect(state.settings.soundEnabled).toBe(false);
    expect(state.settings.bgmEnabled).toBe(false);
    expect(state.settings.hapticsEnabled).toBe(true);

    state = setHapticsEnabled(state, false);
    expect(state.settings.hapticsEnabled).toBe(false);
  });

  it('开关状态经持久化往返保留（冷启动保持，规格场景）', () => {
    let state = createInitialPersistedGameState();
    state = setBgmEnabled(state, false);
    state = setHapticsEnabled(state, false);
    const roundTripped = parsePersistedGameState(serializePersistedGameState(state));
    expect(roundTripped.state.settings.bgmEnabled).toBe(false);
    expect(roundTripped.state.settings.hapticsEnabled).toBe(false);
    expect(roundTripped.state.settings.soundEnabled).toBe(true);
  });
});
