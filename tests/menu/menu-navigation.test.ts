import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY, createEmptyLetterLetterState, serializeLetterLetterState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { computeFontPackageItemRects, computePageItemRects, journalClearRect } from '../../src/core/render/app-overlay-painter';
import { computeMenuLayout } from '../../src/core/render/menu-layout';
import { FONT_PACKAGES } from '../../src/core/render/letter-font';
import { LETTER_THEMES } from '../../src/core/render/letter-theme';
import { FakePlatform } from '../helpers/fake-platform';

function click(platform: FakePlatform, x: number, y: number) { platform.touch('start', x, y); platform.touch('end', x, y); }

/** 点关闭按钮后推进时钟穿过 240ms 滑出动画（行点按不受开启动画影响，无需等待）。 */
function closeMenuAndWait(platform: FakePlatform, menu: ReturnType<typeof computeMenuLayout>) {
  click(platform, menu.closeRect.left + 22, menu.closeRect.top + 22);
  for (let index = 0; index < 3; index += 1) platform.tick(100);
}

async function readyMainScene() {
  const platform = new FakePlatform(); platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true');
  const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
  const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
  return { platform, game, scene };
}

function extractPaper(platform: FakePlatform, scene: ReturnType<typeof computeLetterSceneLayout>) {
  const x = scene.envelopeRect.left + scene.envelopeRect.width / 2;
  const y = scene.envelopeRect.top + 20;
  platform.touch('start', x, y); platform.now += 100;
  platform.touch('move', x, y - 100); platform.touch('end', x, y - 100);
}

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
  let state = createEmptyLetterLetterState();
  state = settleCompletedPostcard(state, { id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '隐藏文字' });
  platform.storage.set(LETTER_BURNING_STORAGE_KEY, serializeLetterLetterState(state));
  const game = new Game({ platformAdapter: platform, privacyPolicyUrl: 'https://example.test/privacy' }); await game.start(); platform.tick(0);
  const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
  click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
  return { platform, game, menu: computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe) };
}

describe('燃信菜单与页面', () => {
  it('信纸抽出后展开中可打开菜单，自动放大编辑会等待菜单关闭', async () => {
    const { platform, game, scene } = await readyMainScene();
    extractPaper(platform, scene);
    expect(game.getTestSnapshot().phase).toBe('unfold');
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('menu');
    for (let index = 0; index < 5; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('edit');
    expect(platform.textRequests).toHaveLength(0);

    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    closeMenuAndWait(platform, menu);
    expect(platform.textRequests).toHaveLength(1);
    expect(platform.textRequests[0].menuRect).toEqual(scene.menuRect);
    await Promise.resolve();
    expect(game.getTestSnapshot().page).toBe('main');
    expect(game.getTestSnapshot().phase).toBe('edit-return');
  });

  it('放大编辑中打开菜单暂存草稿，返回后继续输入，取消仅撤销本次编辑', async () => {
    const { platform, game, scene } = await readyMainScene();
    platform.textResult = { kind: 'menu', draft: '保留的草稿\n第二行' };
    extractPaper(platform, scene);
    for (let index = 0; index < 5; index += 1) platform.tick(100);
    await Promise.resolve();
    expect(game.getTestSnapshot().page).toBe('menu');
    expect(game.getTestSnapshot().phase).toBe('edit');
    expect(game.getTestSnapshot().inputActive).toBe(false);
    expect(platform.textRequests[0].menuRect).toEqual(scene.menuRect);

    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    const fontRow = menu.rows.find((row) => row.action === 'font-packages');
    if (!fontRow) throw new Error('菜单缺少字体套餐入口');
    click(platform, fontRow.rect.left + 20, fontRow.rect.top + fontRow.rect.height / 2);
    expect(game.getTestSnapshot().page).toBe('font-packages');
    click(platform, platform.safe.left + 30, platform.safe.top + 34);
    expect(game.getTestSnapshot().page).toBe('menu');
    platform.textResult = null;
    closeMenuAndWait(platform, menu);
    expect(platform.textRequests[1].initialValue).toBe('保留的草稿\n第二行');
    await Promise.resolve();
    expect(game.getTestSnapshot().page).toBe('main');
    expect(game.getTestSnapshot().phase).toBe('edit-return');
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
  });

  it('信纸回缩和展示位可打开菜单，收好过程不可由菜单打断', async () => {
    const { platform, game, scene } = await readyMainScene();
    platform.textResult = null;
    extractPaper(platform, scene);
    for (let index = 0; index < 5; index += 1) platform.tick(100);
    await Promise.resolve(); await Promise.resolve();
    expect(game.getTestSnapshot().phase).toBe('edit-return');
    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('menu');
    closeMenuAndWait(platform, menu);
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('menu');
    closeMenuAndWait(platform, menu);

    // 展示位点按进入编辑确认后回到展示位，上滑进入收好，收好时序中菜单点按被忽略
    const cardX = scene.cardRect.left + scene.cardRect.width / 2;
    const cardY = scene.cardRect.top + scene.cardRect.height / 2;
    platform.textResult = '心事';
    click(platform, cardX, cardY);
    await Promise.resolve(); await Promise.resolve();
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    platform.touch('start', cardX, cardY); platform.now += 200;
    platform.touch('move', cardX, cardY - 180); platform.touch('end', cardX, cardY - 180);
    for (let index = 0; index < 2; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('settle');
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('main');
    expect(game.getTestSnapshot().phase).toBe('settle');
    for (let index = 0; index < 12; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('quiet');
  });

  it('主题页成套选择：唯一主题默认启用，菜单不再提供图鉴与双槽外观', () => {
    expect(LETTER_THEMES).toHaveLength(1);
    expect(LETTER_THEMES[0]).toMatchObject({ id: 'topic1', unlockMileage: 0 });
    const actions = computeMenuLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }).rows.map((row) => row.action);
    expect(actions).toEqual(['mileage', 'themes', 'font-packages', 'achievements', 'journal', 'privacy']);
  });


  it('主题页成套启用并持久化，点按未解锁主题不生效', async () => {
    const { platform, game, menu } = await preparedGame();
    const themeRow = menu.rows.find((row) => row.action === 'themes');
    expect(themeRow).toBeDefined();
    if (!themeRow) return;
    click(platform, themeRow.rect.left + 20, themeRow.rect.top + themeRow.rect.height / 2);
    expect(game.getTestSnapshot().page).toBe('themes');
    const rects = computePageItemRects(platform.viewport.width, platform.safe, LETTER_THEMES.length);
    click(platform, rects[0].left + 20, rects[0].top + rects[0].height / 2);
    expect(game.getTestSnapshot().persisted.activeThemeId).toBe('topic1');
    expect(platform.storage.get(LETTER_BURNING_STORAGE_KEY)).toContain('topic1');
    click(platform, platform.safe.left + 30, platform.safe.top + 34);
    expect(game.getTestSnapshot().page).toBe('menu');
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
    // 面板外区域的触摸现在会关闭菜单：等待滑出动画完成后重新打开再遍历行
    for (let index = 0; index < 3; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().page).toBe('main');
    const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('menu');
    // 顺序：里程、信的主题、字体套餐（第 3 项）、成就、手帐、隐私政策
    expect(menu.rows.map((row) => row.action)).toEqual(['mileage', 'themes', 'font-packages', 'achievements', 'journal', 'privacy']);
    for (const page of ['mileage', 'themes', 'font-packages', 'achievements'] as const) {
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

  it('菜单支持向右滑动关闭，小位移右移仍按行点按处理', async () => {
    const { platform, game } = await readyMainScene();
    const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('menu');
    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe);

    // 面板内向右滑 70px（垂直分量小）→ 滑出动画结束后回主界面
    const swipeY = menu.panelRect.top + 160;
    const swipeX = menu.panelRect.left + 60;
    platform.touch('start', swipeX, swipeY); platform.touch('move', swipeX + 35, swipeY + 4); platform.touch('end', swipeX + 70, swipeY + 6);
    expect(game.getTestSnapshot().page).toBe('menu');
    for (let index = 0; index < 3; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().page).toBe('main');

    // 点按面板外的遮罩区域同样关闭；面板内的普通点按不误关
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('menu');
    click(platform, menu.panelRect.left - 60, menu.panelRect.top + 160);
    expect(game.getTestSnapshot().page).toBe('menu');
    for (let index = 0; index < 3; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().page).toBe('main');

    // 重新打开菜单：右移不足阈值且落点仍在行内 → 正常触发该行导航
    click(platform, scene.menuRect.left + 24, scene.menuRect.top + 24);
    expect(game.getTestSnapshot().page).toBe('menu');
    const journalRow = menu.rows.find((item) => item.action === 'journal');
    if (!journalRow) throw new Error('菜单缺少手帐入口');
    const rowX = journalRow.rect.left + 30; const rowY = journalRow.rect.top + journalRow.rect.height / 2;
    platform.touch('start', rowX, rowY); platform.touch('move', rowX + 20, rowY + 2); platform.touch('end', rowX + 40, rowY + 3);
    for (let index = 0; index < 7; index += 1) platform.tick(100);
    await Promise.resolve();
    expect(game.getTestSnapshot().page).toBe('journal');
  });

  it('手帐页右上角提供清空整本手帐入口，确认后播放整页燃烧且不调用公开计数', async () => {
    const { platform, game, menu } = await preparedGame();
    await openJournalPage(platform, menu);
    expect(game.getTestSnapshot().page).toBe('journal');
    const clearEntry = journalClearRect(platform.viewport.width, platform.safe);
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
    const entry = journalClearRect(cancelled.platform.viewport.width, cancelled.platform.safe);
    click(cancelled.platform, entry.left + entry.width / 2, entry.top + entry.height / 2); await Promise.resolve();
    expect(cancelled.game.getTestSnapshot().clearJournalActive).toBe(false); expect(cancelled.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1);

    const failed = await preparedGame(); failed.platform.storageWritesSucceed = false;
    await openJournalPage(failed.platform, failed.menu);
    const failedEntry = journalClearRect(failed.platform.viewport.width, failed.platform.safe);
    click(failed.platform, failedEntry.left + failedEntry.width / 2, failedEntry.top + failedEntry.height / 2); await Promise.resolve();
    for (let index = 0; index < 27; index += 1) failed.platform.tick(100);
    await Promise.resolve();
    expect(failed.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1); expect(failed.platform.countCalls).toBe(0);
  });
});
