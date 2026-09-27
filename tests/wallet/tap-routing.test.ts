import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { billRectAtDrawRatio } from '../../src/core/render/bill-geometry';
import { computeSceneLayout } from '../../src/core/render/scene-layout';
import { computeOverlayLayout } from '../../src/core/meta/overlay-layout';
import type { NormalizedTouchPoint, PlatformAdapter, TouchPhase } from '../../src/core/platform';

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };
const layout = computeSceneLayout(VIEWPORT.width, VIEWPORT.height, SAFE_AREA);

function createTouchHarness(openWallet = true) {
  const listeners: Array<(phase: TouchPhase, point: NormalizedTouchPoint) => void> = [];
  let frameCallback: ((timestampMs: number) => void) | null = null;
  let clockMs = 0;
  const gradient = { addColorStop() {} };
  const renderingContext = new Proxy({}, {
    get(_target, property) {
      if (property === 'createLinearGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 12 });
      return () => {};
    },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;
  const adapter: PlatformAdapter = {
    createPrimaryCanvas: () => ({
      renderingContext,
      logicalWidth: VIEWPORT.width,
      logicalHeight: VIEWPORT.height,
    }),
    requestFrame(callback) { frameCallback = callback; return 1; },
    onTouch(listener) { listeners.push(listener); },
    createAudioContext: () => null,
    onAudioInterruption() {},
    presentTextInput: () => Promise.resolve(null),
    triggerHapticImpact() {},
    readPersistentValue: () => null,
    writePersistentValue() {},
    getSafeAreaInsets: () => SAFE_AREA,
    getLogicalViewportSize: () => VIEWPORT,
    onAppVisibilityChange() {},
    prefersReducedMotion: () => false,
    nowMilliseconds: () => clockMs,
    createOffscreenCanvas: () => null,
  };
  const game = new Game({ platformAdapter: adapter });
  game.start();
  const touch = (phase: TouchPhase, x: number, y: number) => {
    for (const listener of listeners) {
      listener(phase, { positionX: x, positionY: y, pointerId: 1 });
    }
  };
  const frames = (count: number) => {
    for (let index = 0; index < count; index += 1) {
      clockMs += 16.67;
      const callback = frameCallback;
      frameCallback = null;
      callback?.(clockMs);
    }
  };
  const tap = (x: number, y: number) => {
    touch('start', x, y);
    touch('end', x, y);
  };
  tap(200, 300); // 背景轻点（标题页已移除，冷启动即主场景）
  frames(1);
  if (openWallet) {
    touch('start', 200, layout.walletRect.top + 50);
    touch('move', 200, layout.walletRect.top + 20); // 上滑 30px 开钱包
    touch('end', 200, layout.walletRect.top + 20);
    frames(120); // 开盖折叠 1680ms（daytime-comfort）≈ 101 帧，留余量
    expect(game.getSmokeTestSnapshot().walletOpen).toBe(true);
  }
  return { game, touch, tap, frames };
}

describe('钱包与纸币的轻点和拖拽归属', () => {
  const visibleBill = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0);
  const centerX = visibleBill.left + visibleBill.width / 2;

  it('关闭态轻点翻盖不打开钱包', () => {
    const harness = createTouchHarness(false);
    harness.tap(200, layout.walletRect.top + 50);
    harness.frames(75);
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.walletOpen).toBe(false);
    expect(state.sessionCount).toBe(0);
  });

  it('纸币上方皮面轻点保持翻盖开启，不抽出现金', () => {
    const harness = createTouchHarness();
    const leatherY = visibleBill.top - 14; // 位于抽钞扩边余量内，同时命中翻盖
    harness.tap(centerX, leatherY);
    harness.frames(75);
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.walletOpen).toBe(true);
    expect(state.sessionCount).toBe(0);
  });

  it('折线下方皮面轻点不抽出现金', () => {
    const harness = createTouchHarness();
    harness.tap(centerX, layout.walletFoldLineY + 20);
    harness.frames(45);
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(0);
  });

  it('轻点实际露出的堆顶纸币不抽出现金', () => {
    const harness = createTouchHarness();
    harness.tap(centerX, visibleBill.top + 12);
    expect(harness.game.getSmokeTestSnapshot().cashPhase).toBe('idle');
    harness.frames(45);
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.walletOpen).toBe(true);
    expect(state.sessionCount).toBe(0);
    expect(state.sessionAmount).toBe(0);
    expect(state.cashPhase).toBe('idle');
  });

  it('连续轻点纸币也不触发自动抽钞', () => {
    const harness = createTouchHarness();
    harness.tap(centerX, visibleBill.top + 12);
    harness.tap(centerX, visibleBill.top + 12);
    harness.frames(45);
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(0);
  });

  it('从露出的堆顶纸币向上拖动过阈值仍抽出一张', () => {
    const harness = createTouchHarness();
    const billY = visibleBill.top + 12;
    harness.touch('start', centerX, billY);
    harness.touch('move', centerX, billY - 220);
    harness.touch('end', centerX, billY - 220);
    harness.frames(45);
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(1);
  });

  it('从皮面余量区向上拖动仍可抓取纸币', () => {
    const harness = createTouchHarness();
    const leatherY = visibleBill.top - 14;
    harness.touch('start', centerX, leatherY);
    harness.touch('move', centerX, leatherY - 20);
    harness.touch('move', centerX, leatherY - 210);
    harness.touch('end', centerX, leatherY - 210);
    harness.frames(45);
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(1);
  });

  it('皮面余量区短距离上移后松手不会误当作纸币点击', () => {
    const harness = createTouchHarness();
    const leatherY = visibleBill.top - 14;
    harness.touch('start', centerX, leatherY);
    harness.touch('move', centerX, leatherY - 10);
    harness.touch('end', centerX, leatherY - 10);
    harness.frames(45);
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.walletOpen).toBe(true);
    expect(state.sessionCount).toBe(0);
  });

  it('从皮面余量区向下滑动关闭翻盖，不抽钞', () => {
    const harness = createTouchHarness();
    const leatherY = visibleBill.top - 14;
    harness.touch('start', centerX, leatherY);
    harness.touch('move', centerX, leatherY + 35);
    harness.touch('end', centerX, leatherY + 35);
    harness.frames(120); // 关盖折叠 1520ms（daytime-comfort）≈ 92 帧
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.walletOpen).toBe(false);
    expect(state.sessionCount).toBe(0);
  });

  it('上一张完成动画期间再次上拖纸币仍可接管，且两都计数（连抽结算）', () => {
    const harness = createTouchHarness();
    const billY = visibleBill.top + 12;
    harness.touch('start', centerX, billY);
    harness.touch('move', centerX, billY - 220);
    harness.touch('end', centerX, billY - 220);
    harness.frames(5);
    harness.touch('start', centerX, billY);
    harness.touch('move', centerX, billY - 220);
    harness.touch('end', centerX, billY - 220);
    harness.frames(45);
    // 在途张在再抓取瞬间结算 + 新张完成：两都计入（rapid-draw-settlement）
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(2);
  });

  it('连续快速三连抽每张都计数', () => {
    const harness = createTouchHarness();
    const billY = visibleBill.top + 12;
    for (let drawIndex = 0; drawIndex < 3; drawIndex += 1) {
      harness.touch('start', centerX, billY);
      harness.touch('move', centerX, billY - 220);
      harness.touch('end', centerX, billY - 220);
      harness.frames(4); // 每张松手后仅 ~67ms（< 480ms 完成动画）即开始下一抓
    }
    harness.frames(45);
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(3);
  });
});

describe('元进程抽屉入口与导航', () => {
  const entry = layout.metaEntryAnchor;
  const drawerLayout = computeOverlayLayout('menu', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);

  /** 菜单行中心点 */
  function menuRowCenter(action: string): { x: number; y: number } {
    const row = drawerLayout.buttons.find((button) => button.action === action);
    if (!row) throw new Error(`菜单行缺失：${action}`);
    return {
      x: row.hitRect.left + row.hitRect.width / 2,
      y: row.hitRect.top + row.hitRect.height / 2,
    };
  }

  it('右上角入口唤出抽屉菜单首屏', () => {
    const harness = createTouchHarness();
    harness.tap(entry.centerX, entry.centerY);
    harness.frames(12); // 滑入完成（180ms ≈ 11 帧）
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.drawerOpen).toBe(true);
    expect(state.drawerStage).toBe('menu');
  });

  it('抽屉打开期间主画面手势被隔离（上拖纸币不抽钞、下滑不关盖）', () => {
    const harness = createTouchHarness();
    const visible = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0);
    const billX = visible.left + visible.width / 2;
    const billY = visible.top + 12;
    harness.tap(entry.centerX, entry.centerY);
    harness.frames(12);
    // 抽钞方向的完整手势
    harness.touch('start', billX, billY);
    harness.touch('move', billX, billY - 220);
    harness.touch('end', billX, billY - 220);
    harness.frames(45);
    // 关盖方向的完整手势
    harness.touch('start', billX, visible.top - 14);
    harness.touch('move', billX, visible.top - 14 + 35);
    harness.touch('end', billX, visible.top - 14 + 35);
    harness.frames(75);
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.drawerOpen).toBe(true);
    expect(state.sessionCount).toBe(0);
    expect(state.walletOpen).toBe(true);
  });

  it('菜单进页与返回：设置页 ↔ 菜单往返', () => {
    const harness = createTouchHarness();
    harness.tap(entry.centerX, entry.centerY);
    harness.frames(12);
    const settingsRow = menuRowCenter('menu-settings');
    harness.tap(settingsRow.x, settingsRow.y);
    expect(harness.game.getSmokeTestSnapshot().drawerStage).toBe('settings');
    harness.frames(1); // 重算当前帧的抽屉布局（命中基于最近一帧渲染的布局）
    // 头部返回钮（布局同源取矩形）
    const settingsLayout = computeOverlayLayout('settings', VIEWPORT.width, VIEWPORT.height, SAFE_AREA);
    const backButton = settingsLayout.buttons.find((button) => button.action === 'back-to-menu');
    if (!backButton) throw new Error('返回钮缺失');
    harness.tap(
      backButton.hitRect.left + backButton.hitRect.width / 2,
      backButton.hitRect.top + backButton.hitRect.height / 2,
    );
    expect(harness.game.getSmokeTestSnapshot().drawerStage).toBe('menu');
  });

  it('点抽屉外衬底关闭抽屉，主画面交互恢复', () => {
    const harness = createTouchHarness();
    harness.tap(entry.centerX, entry.centerY);
    harness.frames(12);
    harness.tap(5, 500); // 抽屉左侧衬底
    harness.frames(12);  // 滑出完成（140ms ≈ 9 帧）
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.drawerOpen).toBe(false);
    // 关闭后主画面手势恢复：可正常抽钞
    const visible = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0);
    const billX = visible.left + visible.width / 2;
    const billY = visible.top + 12;
    harness.touch('start', billX, billY);
    harness.touch('move', billX, billY - 220);
    harness.touch('end', billX, billY - 220);
    harness.frames(45);
    expect(harness.game.getSmokeTestSnapshot().sessionCount).toBe(1);
  });

  it('滑入动画期点菜单行位置不误触发导航', () => {
    const harness = createTouchHarness();
    harness.tap(entry.centerX, entry.centerY);
    harness.frames(2); // 仍处于滑入中（~33ms < 180ms）
    const settingsRow = menuRowCenter('menu-settings');
    // 该行此刻尚未滑到（视觉上是衬底）→ 立即关闭
    harness.tap(settingsRow.x, settingsRow.y);
    harness.frames(12);
    expect(harness.game.getSmokeTestSnapshot().drawerOpen).toBe(false);
  });

  it('开抽屉后首帧布局构建前的触摸不落回主场景手势（一帧窗口短路）', () => {
    const harness = createTouchHarness();
    const visible = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0);
    const billX = visible.left + visible.width / 2;
    const billY = visible.top + 12;
    harness.tap(entry.centerX, entry.centerY);
    // 不跑帧：此刻 currentOverlayLayout 尚为 null，触摸必须作废而非驱动抽钞
    harness.touch('start', billX, billY);
    harness.touch('move', billX, billY - 220);
    harness.touch('end', billX, billY - 220);
    harness.frames(45);
    const state = harness.game.getSmokeTestSnapshot();
    expect(state.drawerOpen).toBe(true);
    expect(state.sessionCount).toBe(0);
  });

  it('抽屉上向右滑动超过阈值收回抽屉', () => {
    const harness = createTouchHarness();
    harness.tap(entry.centerX, entry.centerY);
    harness.frames(12);
    // 抽屉中部空白区起手，向右滑 40px（阈值 24px）
    const swipeY = drawerLayout.panelRect.top + drawerLayout.panelRect.height * 0.6;
    const swipeStartX = drawerLayout.panelRect.left + 60;
    harness.touch('start', swipeStartX, swipeY);
    harness.touch('move', swipeStartX + 40, swipeY);
    harness.touch('end', swipeStartX + 40, swipeY);
    harness.frames(12); // 滑出完成
    expect(harness.game.getSmokeTestSnapshot().drawerOpen).toBe(false);
  });

  it('抽屉上纵向滑动与未过阈值的轻微右滑不收回', () => {
    const harness = createTouchHarness();
    harness.tap(entry.centerX, entry.centerY);
    harness.frames(12);
    const swipeY = drawerLayout.panelRect.top + drawerLayout.panelRect.height * 0.6;
    const swipeStartX = drawerLayout.panelRect.left + 60;
    // 纵向滑动（横移小于纵移）
    harness.touch('start', swipeStartX, swipeY);
    harness.touch('move', swipeStartX + 8, swipeY - 60);
    harness.touch('end', swipeStartX + 8, swipeY - 60);
    // 轻微右滑（低于 24px 阈值）
    harness.touch('start', swipeStartX, swipeY);
    harness.touch('move', swipeStartX + 12, swipeY);
    harness.touch('end', swipeStartX + 12, swipeY);
    harness.frames(12);
    expect(harness.game.getSmokeTestSnapshot().drawerOpen).toBe(true);
  });
});
