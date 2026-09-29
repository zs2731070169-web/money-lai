import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY, createEmptyLetterBurningState, serializeLetterBurningState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { computeFontPackageItemRects, computeGalleryLayout, journalClearRect } from '../../src/core/render/app-overlay-painter';
import { computeMenuLayout } from '../../src/core/render/menu-layout';
import { FONT_PACKAGES } from '../../src/core/render/letter-font';
import { FakePlatform } from '../helpers/fake-platform';

function click(platform: FakePlatform, x: number, y: number) { platform.touch('start', x, y); platform.touch('end', x, y); }

/** 从菜单进入手帐页：点行后推进 0.6s 渐暗转场。 */
async function openJournalPage(platform: FakePlatform, menu: ReturnType<typeof computeMenuLayout>) {
  const row = menu.rows.find((item) => item.action === 'journal');
  if (!row) throw new Error('菜单缺少手帐入口');
  click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2);
  for (let index = 0; index < 7; index += 1) platform.tick(100);
  await Promise.resolve();
}

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
  it('图鉴使用单张真实信纸素材居中呈现，不恢复旧 24 格代码图案', () => {
    const safe = { top: 20, bottom: 0, left: 0, right: 0 };
    const initial = computeGalleryLayout(375, 667, safe, 0);
    expect(initial.maximumScroll).toBe(0);
    expect(initial.cells).toHaveLength(1);
    expect(initial.cells[0].patternIndex).toBe(0);
    expect(initial.cells[0].rect.left + initial.cells[0].rect.width / 2).toBeCloseTo(375 / 2);
  });

  it('字体套餐页可切换并通过新状态键恢复', async () => {
    const { platform, game, menu } = await preparedGame();
    const packageRow = menu.rows.find((row) => row.action === 'font-packages');
    expect(packageRow).toBeDefined();
    if (!packageRow) return;
    click(platform, packageRow.rect.left + 20, packageRow.rect.top + packageRow.rect.height / 2);
    expect(game.getTestSnapshot().page).toBe('font-packages');
    const rects = computeFontPackageItemRects(platform.viewport.width, platform.safe, FONT_PACKAGES.length);
    click(platform, rects[2].left + 20, rects[2].top + rects[2].height / 2);
    expect(game.getTestSnapshot().persisted.activeFontPackageId).toBe('romantic-literary');
    expect(platform.storage.get(LETTER_BURNING_STORAGE_KEY)).toContain('romantic-literary');
    click(platform, platform.safe.left + 30, platform.safe.top + 34);
    expect(game.getTestSnapshot().page).toBe('menu');
  });

  it('菜单打开后隔离主界面，字体套餐位于第 4 项并可进入各功能页', async () => {
    const { platform, game, menu } = await preparedGame();
    expect(game.getTestSnapshot().page).toBe('menu');
    platform.touch('start', 200, 700); platform.touch('move', 200, 400); platform.touch('end', 20, 400);
    expect(game.getTestSnapshot().phase).toBe('idle');
    // 顺序：里程、图鉴、外观、字体套餐（第 4 项）、成就、手帐、隐私政策
    expect(menu.rows.map((row) => row.action)).toEqual(['mileage', 'gallery', 'appearances', 'font-packages', 'achievements', 'journal', 'privacy']);
    for (const page of ['mileage', 'gallery', 'appearances', 'font-packages', 'achievements'] as const) {
      const row = menu.rows.find((item) => item.action === page); if (!row) continue;
      click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); expect(game.getTestSnapshot().page).toBe(page);
      click(platform, platform.safe.left + 30, platform.safe.top + 34); expect(game.getTestSnapshot().page).toBe('menu');
    }
  });

  it('菜单不再提供 12355、导出长图与关于入口', () => {
    const menu = computeMenuLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const actions = menu.rows.map((row) => row.action);
    expect(actions).not.toContain('help');
    expect(actions).not.toContain('export');
    expect(actions).not.toContain('about');
    expect(actions).not.toContain('clear');
  });

  it('菜单提供隐私政策外部入口', async () => {
    const { platform, menu } = await preparedGame();
    const row = menu.rows.find((item) => item.action === 'privacy');
    if (!row) throw new Error('菜单缺少隐私政策入口');
    click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2); await Promise.resolve();
    expect(platform.openedUrls).toEqual(['https://example.test/privacy']);
  });

  it('进入手帐先经过 0.6s 渐暗转场', async () => {
    const { platform, game, menu } = await preparedGame(); const row = menu.rows.find((item) => item.action === 'journal');
    if (!row) throw new Error('菜单缺少手帐入口');
    click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2);
    expect(game.getTestSnapshot().page).toBe('main');
    for (let index = 0; index < 5; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().page).toBe('main'); platform.tick(100); expect(game.getTestSnapshot().page).toBe('journal');
  });

  it('减弱动态效果下缩短非关键页面转场', async () => {
    const platform = new FakePlatform(); platform.reducedMotion = true; platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true');
    const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
    const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe); click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe); const row = menu.rows.find((item) => item.action === 'journal');
    if (!row) throw new Error('菜单缺少手帐入口');
    click(platform, row.rect.left + 20, row.rect.top + row.rect.height / 2);
    platform.tick(100); expect(game.getTestSnapshot().page).toBe('main'); platform.tick(100); expect(game.getTestSnapshot().page).toBe('journal');
  });

  it('手帐页页脚提供烧掉整本手帐入口，确认后播放整页燃烧且不调用公开计数', async () => {
    const { platform, game, menu } = await preparedGame();
    await openJournalPage(platform, menu);
    expect(game.getTestSnapshot().page).toBe('journal');
    const clearEntry = journalClearRect(platform.viewport.width, platform.viewport.height, platform.safe);
    click(platform, clearEntry.left + clearEntry.width / 2, clearEntry.top + clearEntry.height / 2); await Promise.resolve();
    expect(game.getTestSnapshot().clearJournalActive).toBe(true);
    for (let index = 0; index < 27; index += 1) platform.tick(100);
    await Promise.resolve();
    const state = game.getTestSnapshot().persisted;
    expect(state.journalEntries).toEqual([]); expect(state.collectedPatternIds).toEqual([]); expect(state.postcardMileage).toBe(1); expect(state.achievementIds.length).toBeGreaterThan(0); expect(platform.countCalls).toBe(0);
  });

  it('取消清空或落库失败时完整保留原手帐', async () => {
    const cancelled = await preparedGame(); cancelled.platform.confirmation = false;
    await openJournalPage(cancelled.platform, cancelled.menu);
    const entry = journalClearRect(cancelled.platform.viewport.width, cancelled.platform.viewport.height, cancelled.platform.safe);
    click(cancelled.platform, entry.left + entry.width / 2, entry.top + entry.height / 2); await Promise.resolve();
    expect(cancelled.game.getTestSnapshot().clearJournalActive).toBe(false); expect(cancelled.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1);

    const failed = await preparedGame(); failed.platform.storageWritesSucceed = false;
    await openJournalPage(failed.platform, failed.menu);
    const failedEntry = journalClearRect(failed.platform.viewport.width, failed.platform.viewport.height, failed.platform.safe);
    click(failed.platform, failedEntry.left + failedEntry.width / 2, failedEntry.top + failedEntry.height / 2); await Promise.resolve();
    for (let index = 0; index < 27; index += 1) failed.platform.tick(100);
    await Promise.resolve();
    expect(failed.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1); expect(failed.platform.countCalls).toBe(0);
  });
});
