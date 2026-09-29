import { describe, expect, it } from 'vitest';
import { Game, shouldTriggerEnvelopeDrawOut } from '../../src/core/game';
import { beginDraw, createBurningState, movePointer } from '../../src/core/letter/burning-state';
import { LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY, createEmptyLetterBurningState, serializeLetterBurningState, settleCompletedPostcard, type LetterBurningPersistedState } from '../../src/core/journal/journal-state';
import { computeLetterSceneLayout, containsPoint } from '../../src/core/render/letter-layout';
import { FakePlatform } from '../helpers/fake-platform';

async function readyGame(textResult: string | null = '原文', initialState?: LetterBurningPersistedState) {
  const platform = new FakePlatform(); platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true'); platform.textResult = textResult;
  if (initialState) platform.storage.set(LETTER_BURNING_STORAGE_KEY, serializeLetterBurningState(initialState));
  const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
  return { game, platform, layout: computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe) };
}

async function burnCurrentCard(platform: FakePlatform, layout: ReturnType<typeof computeLetterSceneLayout>): Promise<void> {
  drawAndFlip(platform, layout);
  const cx = layout.cardRect.left + layout.cardRect.width / 2; const cy = layout.cardRect.top + layout.cardRect.height / 2;
  await Promise.resolve();
  for (let index = 0; index < 4; index += 1) platform.tick(100);
  platform.touch('start', cx, cy); platform.now += 200; platform.touch('move', cx, cy - 180); platform.touch('end', cx, cy - 180);
  for (let index = 0; index < 30; index += 1) platform.tick(100);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 抽取释放后推进时钟穿过 450ms 自动展开并进入全屏编辑相位 */
function advancePastUnfold(platform: FakePlatform): void {
  for (let index = 0; index < 5; index += 1) platform.tick(100);
}

function drawAndFlip(platform: FakePlatform, layout: ReturnType<typeof computeLetterSceneLayout>) {
  const x = layout.envelopeRect.left + layout.envelopeRect.width / 2; const y = layout.envelopeRect.top + 20;
  platform.touch('start', x, y); platform.now += 100; platform.touch('move', x, y - 100); platform.touch('end', x, y - 100);
  advancePastUnfold(platform);
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

describe('信封到燃烧的端到端链路', () => {
  it('抽取音效在首次小步上移时也能触发，不要求单帧达到 1px', () => {
    const drawing = beginDraw(createBurningState(), 1, 700, 0);
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

  it('抽取、翻面、输入、甩出、保存、匿名计数、统计、复位', async () => {
    const { game, platform, layout } = await readyGame('一句话\n第二行'); drawAndFlip(platform, layout);
    const cx = layout.cardRect.left + layout.cardRect.width / 2; const cy = layout.cardRect.top + layout.cardRect.height / 2;
    await Promise.resolve();
    expect(game.getTestSnapshot().phase).toBe('edit-return');
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    platform.touch('start', cx, cy); platform.now += 200; platform.touch('move', cx, cy - 180); platform.touch('end', cx, cy - 180);
    expect(game.getTestSnapshot().phase).toBe('burn');
    for (let index = 0; index < 30; index += 1) platform.tick(100);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(game.getTestSnapshot().persisted.journalEntries[0].text).toBe('一句话\n第二行');
    expect(game.getTestSnapshot().persisted.postcardMileage).toBe(1);
    expect(platform.countCalls).toBe(1);
    for (let index = 0; index < 8 + 18; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('stat');
    for (let index = 0; index < 30; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('idle');
    expect(platform.storage.has(LETTER_BURNING_STORAGE_KEY)).toBe(true);
  });

  it('取消输入与未达阈值回弹都保留已有文字', async () => {
    const { game, platform, layout } = await readyGame(null); drawAndFlip(platform, layout);
    const cx = layout.cardRect.left + layout.cardRect.width / 2; const cy = layout.cardRect.top + layout.cardRect.height / 2;
    await Promise.resolve();
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    platform.touch('start', cx, cy); platform.now += 300; platform.touch('move', cx, cy - 20); platform.touch('end', cx, cy - 20);
    expect(game.getTestSnapshot().phase).toBe('rebound');
    platform.tick(100); platform.tick(100); platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
  });

  it('空白、多项解锁、偶数节奏和离线计数均按完整时钟链路降级', async () => {
    let beforeThird = createEmptyLetterBurningState();
    beforeThird = settleCompletedPostcard(beforeThird, { id: 'a', createdAtIso: '2026-09-26T00:00:00.000Z', patternId: 'postcard-01', text: '一' });
    beforeThird = settleCompletedPostcard(beforeThird, { id: 'b', createdAtIso: '2026-09-27T00:00:00.000Z', patternId: 'postcard-02', text: '二' });
    const odd = await readyGame('', beforeThird); odd.platform.countResult = 33; await burnCurrentCard(odd.platform, odd.layout);
    expect(odd.game.getTestSnapshot().persisted.unlockedAppearanceIds).toEqual(expect.arrayContaining(['envelope-rose', 'paper-fiber']));
    expect(odd.game.getTestSnapshot().persisted.achievementIds).toContain('first-blank');
    for (let index = 0; index < 26; index += 1) odd.platform.tick(100);
    expect(odd.game.getTestSnapshot().phase).toBe('stat');

    const beforeSecond = settleCompletedPostcard(createEmptyLetterBurningState(), { id: 'a', createdAtIso: '2026-09-27T00:00:00.000Z', patternId: 'postcard-01', text: '' });
    const even = await readyGame('', beforeSecond); even.platform.countResult = 44; await burnCurrentCard(even.platform, even.layout);
    for (let index = 0; index < 26; index += 1) even.platform.tick(100);
    expect(even.game.getTestSnapshot().phase).toBe('idle'); expect(even.platform.countCalls).toBe(1);

    const offline = await readyGame('离线内容'); offline.platform.countResult = null; await burnCurrentCard(offline.platform, offline.layout);
    for (let index = 0; index < 26; index += 1) offline.platform.tick(100);
    expect(offline.game.getTestSnapshot().phase).toBe('idle'); expect(offline.game.getTestSnapshot().persisted.journalEntries).toHaveLength(1);
  });

  it('输入面板打开期间信纸不渲染引导语，取消空白后恢复', async () => {
    const platform = new HeldInputPlatform(); platform.storage.set(PRIVACY_CONSENT_STORAGE_KEY, 'true');
    const game = new Game({ platformAdapter: platform }); await game.start(); platform.tick(0);
    const layout = computeLetterSceneLayout(platform.viewport.width, platform.viewport.height, platform.safe);
    drawAndFlip(platform, layout);
    expect(game.getTestSnapshot().phase).toBe('edit');
    expect(game.getTestSnapshot().inputActive).toBe(true);

    // 输入面板激活期间渲染的帧不应再往信纸上画引导语（透明面板下会与输入文字叠印）
    platform.paintedTexts.length = 0; platform.tick(100);
    expect(platform.paintedTexts.join('')).toBe('');

    // 取消且未输入文字：信纸恢复引导语
    platform.settleDraft(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    platform.paintedTexts.length = 0; platform.tick(100);
    expect(platform.paintedTexts.join('')).toContain('想说的是……');

    // 确认一句话回到背面后再次点开编辑：信纸上的旧文字同样不与输入面板叠印
    const cardX = layout.cardRect.left + layout.cardRect.width / 2; const cardY = layout.cardRect.top + layout.cardRect.height / 2;
    platform.touch('start', cardX, cardY); platform.now += 100; platform.touch('end', cardX, cardY);
    expect(game.getTestSnapshot().inputActive).toBe(true);
    platform.settleDraft('一句话');
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 4; index += 1) platform.tick(100);
    expect(game.getTestSnapshot().phase).toBe('back');
    platform.touch('start', cardX, cardY); platform.now += 100; platform.touch('end', cardX, cardY);
    expect(game.getTestSnapshot().inputActive).toBe(true);
    platform.paintedTexts.length = 0; platform.tick(100);
    expect(platform.paintedTexts.join('')).toBe('');

    // 取消编辑：已确认文字原样回到信纸
    platform.settleDraft(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
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
