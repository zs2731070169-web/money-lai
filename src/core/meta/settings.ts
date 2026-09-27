import { PersistedGameStateV1 } from './game-state';

/**
 * 设置模型（meta-progression 规格「设置页」+ sleep-mode「晚安模式入口」）：
 * 音效/BGM/触觉/晚安模式四开关的纯函数更新，变更由调用方持久化。
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

/** 晚安模式开关（sleep-mode 规格）：开启即进入夜间会话、关闭即退出，开关状态持久化 */
export function setBedtimeModeEnabled(
  state: PersistedGameStateV1,
  enabled: boolean,
): PersistedGameStateV1 {
  return { ...state, settings: { ...state.settings, bedtimeModeEnabled: enabled } };
}
