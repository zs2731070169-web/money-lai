import { describe, expect, it } from 'vitest';
import {
  PERSISTED_STATE_STORAGE_KEY,
  createInitialPersistedGameState,
  createInitialSessionProgress,
  parsePersistedGameState,
  serializePersistedGameState,
} from '../../src/core/meta/game-state';

/**
 * 状态边界单测（任务 3.4 验证入口，对应 cash-drawing「抽取进度会话化」与
 * platform-adaptation「状态持久化契约」）：
 * 金额/张数为会话态不落盘、元进程与 lifetimeDrawCount 持久化、损坏 JSON 重置兜底。
 */

describe('持久化状态（元进程）', () => {
  it('序列化/反序列化往返一致', () => {
    const initialState = createInitialPersistedGameState();
    initialState.lifetimeDrawCount = 137;
    initialState.gallery['denomination-100'] = 42;
    initialState.unlockedSkins.push('wallet-caramel');
    initialState.settings.bgmEnabled = false;

    const serializedJson = serializePersistedGameState(initialState);
    const parsedState = parsePersistedGameState(serializedJson);
    expect(parsedState.state).toEqual(initialState);
    expect(parsedState.resetToInitial).toBe(false);
  });

  it('存储键为版本化的 money-lai/state/v1', () => {
    expect(PERSISTED_STATE_STORAGE_KEY).toBe('money-lai/state/v1');
  });

  it('默认设置：声音/BGM/触觉全部开启', () => {
    const initialState = createInitialPersistedGameState();
    expect(initialState.settings.soundEnabled).toBe(true);
    expect(initialState.settings.bgmEnabled).toBe(true);
    expect(initialState.settings.hapticsEnabled).toBe(true);
  });
});

describe('损坏与缺失兜底（规格：存储不可用降级）', () => {
  it('null（键不存在）→ 初始态', () => {
    const parsedState = parsePersistedGameState(null);
    expect(parsedState.state).toEqual(createInitialPersistedGameState());
    expect(parsedState.resetToInitial).toBe(false);
  });

  it('损坏 JSON → 初始态且不抛出（resetToInitial 标记）', () => {
    const parsedState = parsePersistedGameState('{broken json,,,');
    expect(parsedState.state).toEqual(createInitialPersistedGameState());
    expect(parsedState.resetToInitial).toBe(true);
  });

  it('结构不合法（非对象/缺字段）→ 初始态', () => {
    expect(parsePersistedGameState('"just a string"').resetToInitial).toBe(true);
    expect(parsePersistedGameState('42').resetToInitial).toBe(true);
    expect(parsePersistedGameState('{"schemaVersion":1,"lifetimeDrawCount":"not-a-number"}').resetToInitial).toBe(true);
  });

  it('未知 schemaVersion → 初始态（版本前向兜底）', () => {
    const futureState = createInitialPersistedGameState();
    const futureJson = JSON.stringify({ ...futureState, schemaVersion: 99 });
    expect(parsePersistedGameState(futureJson).resetToInitial).toBe(true);
  });
});

describe('旧档迁移（grouped-skin-selection：单槽 activeSkin → 双槽）', () => {
  /** 构造旧形态存档（无 activeWalletSkin/activeBillSkin，仅 activeSkin） */
  function buildLegacyJson(activeSkin: string, unlockedSkins: string[]): string {
    const base = createInitialPersistedGameState();
    return JSON.stringify({
      schemaVersion: base.schemaVersion,
      lifetimeDrawCount: base.lifetimeDrawCount,
      gallery: base.gallery,
      unlockedSkins,
      activeSkin,
      achievements: base.achievements,
      settings: base.settings,
    });
  }

  it('旧形态 activeSkin=wallet-* → 钱包槽承接、纸币槽为原色（null）', () => {
    const parsed = parsePersistedGameState(
      buildLegacyJson('wallet-caramel', ['wallet-classic', 'wallet-caramel']),
    );
    expect(parsed.resetToInitial).toBe(false);
    expect(parsed.state.activeWalletSkin).toBe('wallet-caramel');
    expect(parsed.state.activeBillSkin).toBeNull();
  });

  it('旧形态 activeSkin=bill-* → 纸币槽承接、钱包槽回经典', () => {
    const parsed = parsePersistedGameState(
      buildLegacyJson('bill-sage', ['wallet-classic', 'bill-sage']),
    );
    expect(parsed.state.activeWalletSkin).toBe('wallet-classic');
    expect(parsed.state.activeBillSkin).toBe('bill-sage');
  });

  it('新形态直收且往返一致', () => {
    const state = createInitialPersistedGameState();
    state.activeWalletSkin = 'wallet-moss';
    state.activeBillSkin = 'bill-amber';
    const parsed = parsePersistedGameState(serializePersistedGameState(state));
    expect(parsed.state).toEqual(state);
    expect(parsed.resetToInitial).toBe(false);
  });
});

describe('会话进度与持久化边界（规格：抽取进度会话化）', () => {
  it('会话进度初始为零（每次冷启动新钱包）', () => {
    const sessionProgress = createInitialSessionProgress();
    expect(sessionProgress.sessionAmount).toBe(0);
    expect(sessionProgress.sessionCount).toBe(0);
  });

  it('持久化序列化结果不含会话金额/张数字段（不落盘契约）', () => {
    const initialState = createInitialPersistedGameState();
    const serializedJson = serializePersistedGameState(initialState);
    expect(serializedJson).not.toContain('sessionAmount');
    expect(serializedJson).not.toContain('sessionCount');
    expect(serializedJson).toContain('lifetimeDrawCount');
  });
});
