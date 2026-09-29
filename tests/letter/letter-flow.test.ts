import { describe, expect, it } from 'vitest';
import { Game, shouldTriggerEnvelopeDrawOut } from '../../src/core/game';
import { beginDraw, createLetterState, movePointer } from '../../src/core/letter/letter-state';
import { LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY, createEmptyLetterLetterState, serializeLetterLetterState, settleCompletedPostcard, type LetterBurningPersistedState } from '../../src/core/journal/journal-state';
import { computeLetterSceneLayout, containsPoint } from '../../src/core/render/letter-layout';
import { computeMenuLayout } from '../../src/core/render/menu-layout';
import { FakePlatform } from '../helpers/fake-platform';

async function readyGame(textResult: string | null = '原文', initialState?: LetterBurningPersistedState) {
  const platform = new FakePlatform(); platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true'); platform.textResult = textResult;
  if (initialState) platform.storage.set(LETTER_BURNING_STORAGE_KEY, serializeLetterLetterState(initialState));
  const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
  return { game, platform, layout: computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe) };
}

/** 抽取释放后推进时钟穿过 450ms 自动展开并进入全屏编辑相位 */
function advancePastUnfold(platform: FakePlatform): void {
  for (let index = 0; index < 5; index += 1) platform.tick(100);
}

async function drawAndFlip(platform: FakePlatform, layout: ReturnType<typeof computeLetterSceneLayout>) {
  const x = layout.envelopeRect.left + layout.envelopeRect.width / 2; const y = layout.envelopeRect.top + 20;
  platform.touch('start', x, y); platform.now += 100; platform.touch('move', x, y - 100); platform.touch('end', x, y - 100);
  advancePastUnfold(platform);
}

/** 确认输入解析完成后推进 edit-return(320ms) 停到展示位 */
async function confirmToBack(platform: FakePlatform, layout: ReturnType<typeof computeLetterSceneLayout>) {
  await drawAndFlip(platform, layout);
  await Promise.resolve(); await Promise.resolve();
  for (let index = 0; index < 4; index += 1) platform.tick(100);
}

/** 展示位上滑释放：位移 180px 触发收好 */
function swipeUpToTuck(platform: FakePlatform, layout: ReturnType<typeof computeLetterSceneLayout>) {
  const cardX = layout.cardRect.left + layout.cardRect.width / 2;
  const cardY = layout.cardRect.top + layout.cardRect.height / 2;
  platform.touch('start', cardX, cardY); platform.now += 200;
  platform.touch('move', cardX, cardY - 180); platform.touch('end', cardX, cardY - 180);
}

/** 确认→展示位→上滑→收好动画走完进入安静等待 */
async function confirmThroughSettle(platform: FakePlatform, layout: ReturnType<typeof computeLetterSceneLayout>) {
  await confirmToBack(platform, layout);
  swipeUpToTuck(platform, layout);
  for (let index = 0; index < 5; index += 1) platform.tick(100);
}

/** 挂起多行输入并在主画布上记录 fillText，用于断言输入期间/之后的信纸文字渲染。 */
class HeldInputPlatform extends FakePlatform {
  readonly paintedTexts: string[] = [];
  private settleDraftPromise: ((value: string | null) => void) | null = null;
  async requestMultilineText(): Promise<string | null> {
    return new Promise((resolve) => { this.settleDraftPromise = resolve; });
  }
  settleDraft(value: string | null): void { this.settleDraftPromise?.(value); this.settleDraftPromise = null; }
  createPrimaryCanvas() {
    const gradient = { addColorStop() {} };
    const canvasShell = { width: this.primaryCanvasShell.width };
    const paintedTexts = this.paintedTexts;
    const context = new Proxy({} as Record<string, unknown>, {
      get(_target, property) {
        if (property === 'canvas') return canvasShell;
        if (property === 'fillText') return (value: string) => { paintedTexts.push(value); };
        if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    return { renderingContext: context, logicalWidth: this.viewport.width, logicalHeight: this.viewport.height };
  }
}

describe('信封到收好的端到端链路', () => {
  it('收好复位保留原文：再次抽出进入编辑以原文为初始内容，手帐往返不清', async () => {
    const { game, platform, layout } = await readyGame('信封里保留的原话');
    // 抽出→编辑（输入层即时以 textResult 确认）→上滑收好→推进到复位
    await drawAndFlip(platform, layout);
    await Promise.resolve(); await Promise.resolve();
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    swipeUpToTuck(platform, layout);
    for (let index = 0; index < 60; index += 1) platform.tick(100);
    await Promise.resolve();
    expect(game.getTestSnapshot().phase).toBe('idle');

    // 打开手帐再返回：原文不清
    const scene = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    platform.touch('start', scene.menuRect.left + 24, scene.menuRect.top + 24); platform.touch('end', scene.menuRect.left + 24, scene.menuRect.top + 24);
    const menu = computeMenuLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    const journalRow = menu.rows.find((row) => row.action === 'journal');
    if (!journalRow) throw new Error('菜单缺少手帐入口');
    platform.touch('start', journalRow.rect.left + 20, journalRow.rect.top + journalRow.rect.height / 2);
    platform.touch('end', journalRow.rect.left + 20, journalRow.rect.top + journalRow.rect.height / 2);
    for (let index = 0; index < 7; index += 1) platform.tick(100);
    await Promise.resolve();
    expect(game.getTestSnapshot().page).toBe('journal');
    platform.touch('start', platform.safe.left + 30, platform.safe.top + 34);
    platform.touch('end', platform.safe.left + 30, platform.safe.top + 34);
    expect(game.getTestSnapshot().page).toBe('main');

    // 再次抽出：进入编辑时输入层以原文为初始内容
    await drawAndFlip(platform, layout);
    await Promise.resolve(); await Promise.resolve();
    expect(platform.textRequests.at(-1)?.initialValue).toBe('信封里保留的原话');
  });

  it('抽取音效在首次小步上移时也能触发，不要求单帧达到 1px', () => {
    const drawing = beginDraw(createLetterState(), 1, 700, 0);
    const moved = movePointer(drawing, 1, 699.5, 16);
    expect(shouldTriggerEnvelopeDrawOut(drawing, moved)).toBe(true);
    expect(shouldTriggerEnvelopeDrawOut(drawing, drawing)).toBe(false);
  });

  it('系统合并快速拖动事件时，抬手坐标仍可完成抽取', async () => {
    const { game, platform, layout } = await readyGame();
    const x = layout.envelopeRect.left + layout.envelopeRect.width / 2; const y = layout.envelopeRect.top + 20;
    platform.touch('start', x, y); platform.now += 80; platform.touch('end', x, y - 100);
    expect(game.getTestSnapshot().phase).toBe('unfold');
    advancePastUnfold(platform);
    expect(game.getTestSnapshot().phase).toBe('edit');
  });

  it('抽取、书写、确认回展示位、上滑收好、保存、匿名计数、统计、复位', async () => {
    const { game, platform, layout } = await readyGame('一句话\n第二行');
    await confirmToBack(platform, layout);
    // 确认只停展示位：未落库、未计数
    expect(game.getTestSnapshot().phase).toBe('back');
    expect(game.getTestSnapshot().persisted.journalEntries).toHaveLength(0);
    expect(platform.countCalls).toBe(0);
    swipeUpToTuck(platform, layout);
    for (let index = 0; index < 5; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('quiet');
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 15; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('stat');
    expect(game.getTestSnapshot().persisted.journalEntries[0].text).toBe('一句话\n第二行');
    expect(game.getTestSnapshot().persisted.postcardMileage).toBe(1);
    expect(platform.countCalls).toBe(1);
    for (let index = 0; index < 30; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('idle');
    expect(platform.storage.has(LETTER_BURNING_STORAGE_KEY)).toBe(true);
  });

  it('取消输入后停在展示位，可再次点开编辑', async () => {
    const { game, platform, layout } = await readyGame(null);
    await drawAndFlip(platform, layout);
    await Promise.resolve(); await Promise.resolve();
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    const cardX = layout.cardRect.left + layout.cardRect.width / 2; const cardY = layout.cardRect.top + layout.cardRect.height / 2;
    platform.touch('start', cardX, cardY); platform.now += 100; platform.touch('end', cardX, cardY);
    expect(game.getTestSnapshot().inputActive).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(game.getTestSnapshot().phase).toBe('edit-return');
  });

  it('空白信纸上滑收好同样保存并达成空白成就', async () => {
    const { game, platform, layout } = await readyGame('');
    await confirmThroughSettle(platform, layout);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(game.getTestSnapshot().persisted.journalEntries[0].text).toBe('');
    expect(game.getTestSnapshot().persisted.achievementIds).toContain('first-blank');
  });

  it('偶数节奏与离线计数均按完整时钟链路降级', async () => {
    const beforeSecond = settleCompletedPostcard(createEmptyLetterLetterState(), { id: 'a', createdAtIso: '2026-09-27T00:00:00.000Z', patternId: 'postcard-01', text: '' });
    const even = await readyGame('', beforeSecond); even.platform.countResult = 44;
    await confirmThroughSettle(even.platform, even.layout);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(even.game.getTestSnapshot().phase).toBe('idle');
    expect(even.platform.countCalls).toBe(1);

    const offline = await readyGame('离线内容'); offline.platform.countResult = null;
    await confirmThroughSettle(offline.platform, offline.layout);
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 15; index += 1) offline.platform.tick(100);
    expect(offline.game.getTestSnapshot().phase).toBe('idle');
    expect(offline.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1);
  });

  it('输入面板打开期间信纸不渲染任何文字；取消空白纸面保持干净，确认后字迹随收好折回', async () => {
    const platform = new HeldInputPlatform(); platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true');
    const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
    const layout = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    await drawAndFlip(platform, layout);
    expect(game.getTestSnapshot().inputActive).toBe(true);

    // 输入面板激活期间画布零文字（引导语只活在输入层占位）
    platform.paintedTexts.length = 0; platform.tick(100);
    expect(platform.paintedTexts.join('')).toBe('');

    // 取消空白：纸面保持干净（画布不再绘制引导语）
    platform.settleDraft(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    platform.paintedTexts.length = 0; platform.tick(100);
    expect(platform.paintedTexts.join('')).toBe('');

    // 再次点开并确认：字迹落在展示位信纸上（不自动收好）
    const cardX = layout.cardRect.left + layout.cardRect.width / 2; const cardY = layout.cardRect.top + layout.cardRect.height / 2;
    platform.touch('start', cardX, cardY); platform.now += 100; platform.touch('end', cardX, cardY);
    platform.settleDraft('一句话');
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    platform.paintedTexts.length = 0; platform.tick(100);
    expect(platform.paintedTexts.join('')).toContain('一句话');

    // 上滑收好：折回入袋过程中字迹随信纸呈现
    platform.touch('start', cardX, cardY); platform.now += 200; platform.touch('move', cardX, cardY - 180); platform.touch('end', cardX, cardY - 180);
    for (let index = 0; index < 2; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('settle');
    platform.paintedTexts.length = 0; platform.tick(100);
    expect(platform.paintedTexts.join('')).toContain('一句话');
  });
});

describe('信封抽取命中区', () => {
  /** 信纸上缘、袋口带与信封主体在命中区上必须连成一块，指腹落在任何可见纸封区域都能起抽。 */
  const dragUp = (platform: FakePlatform, layout: ReturnType<typeof computeLetterSceneLayout>, y: number) => {
    const x = layout.envelopeRect.left + layout.envelopeRect.width / 2;
    platform.touch('start', x, y); platform.now += 100; platform.touch('move', x, y - 120); platform.touch('end', x, y - 120);
  };

  it('命中区覆盖露出的信纸上缘、袋口带与信封主体，且不越界到上方背景', () => {
    const platform = new FakePlatform();
    const layout = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    const centerX = layout.envelopeRect.left + layout.envelopeRect.width / 2;
    expect(layout.envelopeGrabRect.top).toBe(layout.foldedCardRect.top);
    expect(layout.envelopeGrabRect.top + layout.envelopeGrabRect.height).toBeCloseTo(layout.envelopeRect.top + layout.envelopeRect.height, 5);
    expect(containsPoint(layout.envelopeGrabRect, centerX, layout.foldedCardRect.top + 2)).toBe(true);
    expect(containsPoint(layout.envelopeGrabRect, centerX, (layout.envelopeOpeningSideY + layout.envelopeRect.top) / 2)).toBe(true);
    expect(containsPoint(layout.envelopeGrabRect, centerX, layout.envelopeRect.top + layout.envelopeRect.height - 2)).toBe(true);
    expect(containsPoint(layout.envelopeGrabRect, centerX, layout.foldedCardRect.top - 10)).toBe(false);
  });

  it('从露出的信纸上缘起抽可完成抽取', async () => {
    const { game, platform, layout } = await readyGame();
    dragUp(platform, layout, layout.exposedCardRect.top + layout.exposedCardRect.height / 2);
    expect(game.getTestSnapshot().phase).toBe('unfold');
  });

  it('从袋口锚线与信封外框之间的带状区起抽可完成抽取（回归：原为无响应死区）', async () => {
    const { game, platform, layout } = await readyGame();
    dragUp(platform, layout, (layout.envelopeOpeningSideY + layout.envelopeRect.top) / 2);
    expect(game.getTestSnapshot().phase).toBe('unfold');
  });

  it('信纸上方空白背景上拖动不触发抽取', async () => {
    const { game, platform, layout } = await readyGame();
    dragUp(platform, layout, layout.foldedCardRect.top - 40);
    expect(game.getTestSnapshot().phase).toBe('idle');
  });
});
