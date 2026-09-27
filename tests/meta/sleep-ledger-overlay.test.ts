import { describe, expect, it } from 'vitest';
import {
  computeMorningCardLayout,
  computeOverlayLayout,
  overlayPageDataCacheKey,
} from '../../src/core/meta/overlay-layout';
import { paintMorningCard, paintMetaOverlay } from '../../src/core/render/overlay-painter';
import { NightlySleepRecord, sealBedtimeSession } from '../../src/core/sleep/ledger';
import {
  PersistedGameStateV1,
  createInitialPersistedGameState,
  createInitialSessionProgress,
} from '../../src/core/meta/game-state';

/**
 * 睡眠账本覆盖层单测（sleep-mode 规格，任务 4.3/4.4 布局与绘制层）：
 * 抽屉五条目菜单、睡眠账本页、早安卡布局与绘制、缓存键覆盖账本条数。
 */

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };

function rectContainsPoint(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function buildTestRecord(overrides: Partial<NightlySleepRecord> = {}): NightlySleepRecord {
  const sealResult = sealBedtimeSession({
    startedAtMs: 1_000,
    sessionProgressAtEntry: createInitialSessionProgress(),
    sessionProgressAtExit: { sessionAmount: 60, sessionCount: 12 },
    sleepPointMs: 1_000 + 600_000,
    localDateString: '2026-09-27',
  });
  return { ...sealResult.record, ...overrides };
}

/** 记录型 2D 上下文替身：捕获 fillText 文本 */
function createTextRecordingContext() {
  const context = {
    globalAlpha: 1,
    fillStyle: '#000000',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 1,
    drawnTexts: [] as string[],
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    rect: () => {},
    clip: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    setLineDash: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    fillRect: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 10 }) as TextMetrics,
    fillText: (text: string) => {
      context.drawnTexts.push(text);
    },
  };
  return context;
}

describe('抽屉五条目菜单（sleep-mode 规格）', () => {
  it('菜单首屏五行：图鉴/皮肤/成就/睡眠账本/设置，顺序与动作正确', () => {
    const layout = computeOverlayLayout('menu', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
    const menuButtons = layout.buttons.filter((button) => button.action.startsWith('menu-'));
    expect(menuButtons.map((button) => button.action)).toEqual([
      'menu-gallery',
      'menu-skins',
      'menu-achievements',
      'menu-sleep-ledger',
      'menu-settings',
    ]);
    expect(menuButtons.map((button) => button.label)).toEqual(['图鉴', '皮肤', '成就', '睡眠账本', '设置']);
  });

  it('五行命中矩形全部收进抽屉面板（看到的=可点的）', () => {
    const layout = computeOverlayLayout('menu', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
    const menuButtons = layout.buttons.filter((button) => button.action.startsWith('menu-'));
    for (const button of menuButtons) {
      expect(rectContainsPoint(layout.panelRect, button.hitRect.left, button.hitRect.top)).toBe(true);
      expect(
        rectContainsPoint(
          layout.panelRect,
          button.hitRect.left + button.hitRect.width,
          button.hitRect.top + button.hitRect.height,
        ),
      ).toBe(true);
    }
  });

  it('睡眠账本页提供返回菜单按钮', () => {
    const layout = computeOverlayLayout('sleep-ledger', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
    const backButton = layout.buttons.find((button) => button.action === 'back-to-menu');
    expect(backButton).toBeDefined();
    expect(backButton?.label).toBe('‹ 返回');
  });
});

describe('睡眠账本页与早安卡绘制', () => {
  it('账本页绘制汇总行与逐夜记录（最新在上）', () => {
    const layout = computeOverlayLayout('sleep-ledger', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
    const context = createTextRecordingContext();
    paintMetaOverlay(context as unknown as CanvasRenderingContext2D, layout, {
      galleryEntries: [],
      skins: [],
      achievements: [],
      settings: createInitialPersistedGameState().settings,
      sleepLedger: [
        buildTestRecord({ localDateString: '2026-09-26', drawnBillCount: 3, drawnAmount: 15 }),
        buildTestRecord({ localDateString: '2026-09-27', drawnBillCount: 12, drawnAmount: 60 }),
      ],
    });
    const joinedText = context.drawnTexts.join('\n');
    expect(joinedTextsContain(joinedText, '共 2 夜')).toBe(true);
    expect(joinedTextsContain(joinedText, '15 张')).toBe(true);
    expect(joinedTextsContain(joinedText, '75')).toBe(true);
  });

  it('空账本绘制首次引导文案（不打数字）', () => {
    const layout = computeOverlayLayout('sleep-ledger', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
    const context = createTextRecordingContext();
    paintMetaOverlay(context as unknown as CanvasRenderingContext2D, layout, {
      galleryEntries: [],
      skins: [],
      achievements: [],
      settings: createInitialPersistedGameState().settings,
      sleepLedger: [],
    });
    const joinedText = context.drawnTexts.join('\n');
    expect(joinedTextsContain(joinedText, '晚安模式')).toBe(true);
  });

  it('早安卡：入睡封存文案含张数与金额，主动退出变体不含「才睡着」', () => {
    const cardLayout = computeMorningCardLayout(VIEWPORT.width, VIEWPORT.height);
    const sealedContext = createTextRecordingContext();
    paintMorningCard(
      sealedContext as unknown as CanvasRenderingContext2D,
      cardLayout,
      buildTestRecord({ drawnBillCount: 12, drawnAmount: 60, sleepPointMs: 900_000 }),
    );
    const sealedText = sealedContext.drawnTexts.join('\n');
    expect(joinedTextsContain(sealedText, '12 张纸币才睡着')).toBe(true);
    expect(joinedTextsContain(sealedText, '¥60')).toBe(true);
    expect(joinedTextsContain(sealedText, '开始新的一天')).toBe(true);

    const exitedContext = createTextRecordingContext();
    paintMorningCard(
      exitedContext as unknown as CanvasRenderingContext2D,
      cardLayout,
      buildTestRecord({ drawnBillCount: 5, drawnAmount: 25, sleepPointMs: null }),
    );
    expect(joinedTextsContain(exitedContext.drawnTexts.join('\n'), '才睡着')).toBe(false);
  });

  it('早安卡布局：卡片水平居中、关闭按钮在卡片内', () => {
    const cardLayout = computeMorningCardLayout(VIEWPORT.width, VIEWPORT.height);
    const cardCenterX = cardLayout.cardRect.left + cardLayout.cardRect.width / 2;
    expect(cardCenterX).toBeCloseTo(VIEWPORT.width / 2, 5);
    expect(
      rectContainsPoint(
        cardLayout.cardRect,
        cardLayout.dismissButtonRect.left,
        cardLayout.dismissButtonRect.top,
      ) &&
        rectContainsPoint(
          cardLayout.cardRect,
          cardLayout.dismissButtonRect.left + cardLayout.dismissButtonRect.width,
          cardLayout.dismissButtonRect.top + cardLayout.dismissButtonRect.height,
        ),
    ).toBe(true);
  });
});

describe('抽屉页面数据缓存键', () => {
  it('账本条数变化 → 缓存键变化（动画帧复用不串页）', () => {
    const state: PersistedGameStateV1 = createInitialPersistedGameState();
    const beforeKey = overlayPageDataCacheKey(state, 'sleep-ledger');
    state.sleepLedger = [buildTestRecord()];
    const afterKey = overlayPageDataCacheKey(state, 'sleep-ledger');
    expect(beforeKey).not.toBe(afterKey);
  });
});

/** 多行拼接文本包含断言辅助 */
function joinedTextsContain(joinedText: string, expectedFragment: string): boolean {
  return joinedText.includes(expectedFragment);
}
