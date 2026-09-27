import { PersistedGameStateV1 } from './game-state';

/**
 * 设置模型（meta-progression 规格「设置页」）：
 * 音效/BGM/触觉三开关的纯函数更新，变更由调用方持久化。
 */

export function setSoundEnabled(state: PersistedGameStateV1, enabled: boolean): PersistedGameStateV1 {
  return { ...state, settings: { ...state.settings, soundEnabled: enabled } };
}

export function setBgmEnabled(state: PersistedGameStateV1, enabled: boolean): PersistedGameStateV1 {
  return { ...state, settings: { ...state.settings, bgmEnabled: enabled } };
}

export function setHapticsEnabled(state: PersistedGameStateV1, enabled: boolean): PersistedGameStateV1 {
  return { ...state, settings: { ...state.settings, hapticsEnabled: enabled } };
}
