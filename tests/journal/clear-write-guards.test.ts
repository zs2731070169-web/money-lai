import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import {
  LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY,
  createEmptyLetterLetterState, serializeLetterLetterState, settleCompletedPostcard,
} from '../../src/core/journal/journal-state';
import { journalClearRect } from '../../src/core/render/app-overlay-painter';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { computeMenuLayout } from '../../src/core/render/menu-layout';
import { FakePlatform } from '../helpers/fake-platform';

/** 落库回调悬挂（桥接丢失）的平台桩：writePending 期间 write 永不 resolve。 */
class PendingWritePlatform extends FakePlatform {
  writePending = false;
  async writePersistentValue(key: string, value: string): Promise<boolean> {
    this.writes.push({ key, value });
    if (this.writePending) return new Promise(() => {});
    if (this.storageWritesSucceed) this.storage.set(key, value);
    return this.storageWritesSucceed;
  }
}

/** 首次落库失败（弹窗后桥接丢回调的确定化模拟）、重试成功的平台桩。 */
class FailingFirstWritePlatform extends FakePlatform {
  failingWritesRemaining = 0;
  async writePersistentValue(key: string, value: string): Promise<boolean> {
    this.writes.push({ key, value });
    if (this.failingWritesRemaining > 0) { this.failingWritesRemaining -= 1; return false; }
    if (this.storageWritesSucceed) this.storage.set(key, value);
    return this.storageWritesSucceed;
  }
}

/** 安全区读取可注入异常的平台桩：用于制造渲染层抛错。 */
class BrokenSafeAreaPlatform extends FakePlatform {
  broken = false;
  getSafeAreaInsets() { return this.broken ? (null as never) : super.getSafeAreaInsets(); }
}

async function journalGame(platform: FakePlatform) {
  platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true');
  let state = createEmptyLetterLetterState();
  state = settleCompletedPostcard(state, { id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '' });
  platform.storage.set(LETTER_BURNING_STORAGE_KEY, serializeLetterLetterState(state));
  const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
  const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
  const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe);
  const journalRow = menu.rows.find((item) => item.action === 'journal');
  if (!journalRow) throw new Error('菜单缺少手帐入口');
  const menuX = scene.menuRect.left + 24; const menuY = scene.menuRect.top + 24;
  const rowX = journalRow.rect.left + 20; const rowY = journalRow.rect.top + journalRow.rect.height / 2;
  platform.touch('start', menuX, menuY); platform.touch('end', menuX, menuY);
  platform.touch('start', rowX, rowY); platform.touch('end', rowX, rowY);
  for (let index = 0; index < 7; index += 1) platform.tick(100);
  await Promise.resolve();
  return { platform, game };
}

function startClear(platform: FakePlatform) {
  const entry = journalClearRect(platform.viewport.width, platform.safe);
  const x = entry.left + entry.width / 2; const y = entry.top + entry.height / 2;
  platform.touch('start', x, y); platform.touch('end', x, y);
}

describe('清空流程韧性（帧循环与落库兜底）', () => {
  it('落库悬挂时自动重试仍悬挂才解困：不换血、记录保留、帧链存活', async () => {
    const platform = new PendingWritePlatform();
    const { game } = await journalGame(platform);
    platform.writePending = true;
    startClear(platform); await Promise.resolve();
    expect(game.getTestSnapshot().clearJournalActive).toBe(true);
    for (let index = 0; index < 27; index += 1) platform.tick(100); // 渐隐满幅，落库悬挂
    for (let index = 0; index < 13; index += 1) platform.tick(100); // 首试悬挂越上限 → 自动重试
    expect(platform.writes.length).toBe(2); // 重试确实发生
    for (let index = 0; index < 13; index += 1) platform.tick(100); // 重试仍悬挂 → 按失败收场
    expect(game.getTestSnapshot().clearJournalActive).toBe(false);
    expect(game.getTestSnapshot().persisted.journalEntries).toHaveLength(1); // 未确认成功不换血
    expect(platform.frameCallback).not.toBeNull(); // 帧链未断
  });

  it('首写失败自动重试：重试成功即换血清空', async () => {
    const platform = new FailingFirstWritePlatform();
    const { game } = await journalGame(platform);
    platform.failingWritesRemaining = 1;
    startClear(platform); await Promise.resolve();
    for (let index = 0; index < 27; index += 1) platform.tick(100);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); // 首写失败→重试→落定
    expect(platform.writes.length).toBe(2);
    expect(game.getTestSnapshot().persisted.journalEntries).toHaveLength(0);
    expect(game.getTestSnapshot().clearJournalActive).toBe(false);
  });

  it('渲染异常不永久断链帧循环，恢复后续帧正常', async () => {
    const platform = new BrokenSafeAreaPlatform();
    const { game } = await journalGame(platform);
    platform.broken = true;
    platform.tick(100); // frame 内抛错
    expect(platform.frameCallback).not.toBeNull(); // 已补请求下一帧
    platform.broken = false;
    platform.tick(100);
    expect(game.getTestSnapshot().page).toBe('journal');
  });
});
