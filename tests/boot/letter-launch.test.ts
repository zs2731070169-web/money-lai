import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY } from '../../src/core/journal/journal-state';
import { FakePlatform } from '../helpers/fake-platform';

describe('燃信启动顺序', () => {
  it('首次同意前只读取同意门，不读取手帐、不创建画布、不联网', async () => {
    const platform = new FakePlatform(); platform.consent = false;
    const game = new Game({ platformAdapter: platform }); await game.start();
    expect(platform.reads).toEqual([PRIVACY_CONSENT_STORAGE_KEY]);
    expect(platform.countCalls).toBe(0);
    expect(game.getTestSnapshot().ready).toBe(false);
  });

  it('同意后才 hydration 并持久化同意状态', async () => {
    const platform = new FakePlatform(); const game = new Game({ platformAdapter: platform }); await game.start();
    expect(platform.reads).toEqual([PRIVACY_CONSENT_STORAGE_KEY, LETTER_BURNING_STORAGE_KEY]);
    expect(platform.storage.get(PRIVACY_CONSENT_STORAGE_KEY)).toBe('true');
    expect(game.getTestSnapshot().ready).toBe(true);
  });

  it('已同意且存储损坏时安全初始化', async () => {
    const platform = new FakePlatform(); platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true'); platform.storage.set(LETTER_BURNING_STORAGE_KEY, '{bad');
    const game = new Game({ platformAdapter: platform }); await game.start();
    expect(platform.consentRequests).toBe(0);
    expect(game.getTestSnapshot().persisted.journalEntries).toEqual([]);
  });

  it('存储读写均不可用时仍可在当前会话进入主界面', async () => {
    const platform = new FakePlatform(); platform.storageReadsSucceed = false; platform.storageWritesSucceed = false;
    const game = new Game({ platformAdapter: platform }); await game.start();
    expect(game.getTestSnapshot().ready).toBe(true);
    expect(game.getTestSnapshot().persisted.journalEntries).toEqual([]);
  });
});
