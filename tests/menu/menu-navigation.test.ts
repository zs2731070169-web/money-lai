import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY, createEmptyLetterBurningState, serializeLetterBurningState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { computeGalleryLayout } from '../../src/core/render/app-overlay-painter';
import { computeMenuLayout } from '../../src/core/render/menu-layout';
import { FakePlatform } from '../helpers/fake-platform';

function click(platform: FakePlatform, x: number, y: number) { platform.touch('start', x, y); platform.touch('end', x, y); }

async function preparedGame() {
  const platform = new FakePlatform(); platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true');
  let state = createEmptyLetterBurningState();
  state = settleCompletedPostcard(state, { id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '隐藏文字' });
  platform.storage.set(LETTER_BURNING_STORAGE_KEY, serializeLetterBurningState(state));
  const game = new Game({ platformAdapter: platform, privacyPolicyUrl: 'https://example.test/privacy' }); await game.start(); platform.tick(0);
  const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
  click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
  return { platform, game, menu: computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe) };
}

describe('燃信菜单与页面', () => {
  it('iPhone SE 图鉴可滚动到最后一个图案', () => {
    const safe = { top: 20, bottom: 0, left: 0, right: 0 };
    const initial = computeGalleryLayout(375, 667, safe, 0);
    expect(initial.maximumScroll).toBeGreaterThan(0);
    expect(initial.cells.some((cell) => cell.patternIndex === 23)).toBe(false);
    const scrolled = computeGalleryLayout(375, 667, safe, initial.maximumScroll);
    expect(scrolled.cells.some((cell) => cell.patternIndex === 23)).toBe(true);
  });

  it('菜单打开后隔离主界面，并可进入里程、图鉴、外观、成就与关于', async () => {
    const { platform, game, menu } = await preparedGame();
    expect(game.getTestSnapshot().page).toBe('menu');
    platform.touch('start', 200, 700); platform.touch('move', 200, 400); platform.touch('end', 200, 400);
    expect(game.getTestSnapshot().phase).toBe('idle');
    for (const [rowIndex, page] of [[0, 'mileage'], [1, 'gallery'], [2, 'appearances'], [3, 'achievements'], [8, 'about']] as const) {
      const row = menu.rows[rowIndex]; click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); expect(game.getTestSnapshot().page).toBe(page);
      click(platform, platform.safe.left + 30, platform.safe.top + 34); expect(game.getTestSnapshot().page).toBe('menu');
    }
  });

  it('导出通过临时 PNG 系统分享且不改变手帐', async () => {
    const { platform, game, menu } = await preparedGame(); const before = game.getTestSnapshot().persisted.journalEntries;
    const row = menu.rows[5]; click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(platform.shares).toHaveLength(1); expect(platform.shares[0].fileName).toMatch(/\.png$/); expect(game.getTestSnapshot().persisted.journalEntries).toEqual(before);
  });

  it('菜单直接提供 12355 与隐私政策外部入口', async () => {
    const { platform, menu } = await preparedGame();
    for (const rowIndex of [6, 9]) { const row = menu.rows[rowIndex]; click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); await Promise.resolve(); }
    expect(platform.openedUrls).toEqual(['tel:12355', 'https://example.test/privacy']);
  });

  it('进入手帐先经过 0.6s 渐暗转场', async () => {
    const { platform, game, menu } = await preparedGame(); const row = menu.rows[4]; click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2);
    expect(game.getTestSnapshot().page).toBe('main');
    for (let index = 0; index < 5; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().page).toBe('main'); platform.tick(100); expect(game.getTestSnapshot().page).toBe('journal');
  });

  it('减弱动态效果下缩短非关键页面转场', async () => {
    const platform = new FakePlatform(); platform.reducedMotion = true; platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true');
    const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
    const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe); click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe); const row = menu.rows[4]; click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2);
    platform.tick(100); expect(game.getTestSnapshot().page).toBe('main'); platform.tick(100); expect(game.getTestSnapshot().page).toBe('journal');
  });

  it('清空确认后播放整页燃烧，只清手帐与图鉴且不调用公开计数', async () => {
    const { platform, game, menu } = await preparedGame();
    const row = menu.rows[7]; click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); await Promise.resolve();
    expect(game.getTestSnapshot().clearJournalActive).toBe(true);
    for (let index = 0; index < 27; index += 1) platform.tick(100);
    await Promise.resolve();
    const state = game.getTestSnapshot().persisted;
    expect(state.journalEntries).toEqual([]); expect(state.collectedPatternIds).toEqual([]); expect(state.postcardMileage).toBe(1); expect(state.achievementIds.length).toBeGreaterThan(0); expect(platform.countCalls).toBe(0);
  });

  it('取消清空或落库失败时完整保留原手帐', async () => {
    const cancelled = await preparedGame(); cancelled.platform.confirmation = false;
    let row = cancelled.menu.rows[7]; click(cancelled.platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); await Promise.resolve();
    expect(cancelled.game.getTestSnapshot().clearJournalActive).toBe(false); expect(cancelled.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1);

    const failed = await preparedGame(); failed.platform.storageWritesSucceed = false;
    row = failed.menu.rows[7]; click(failed.platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); await Promise.resolve();
    for (let index = 0; index < 27; index += 1) failed.platform.tick(100);
    await Promise.resolve();
    expect(failed.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1); expect(failed.platform.countCalls).toBe(0);
  });
});
