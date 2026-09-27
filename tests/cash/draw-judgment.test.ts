import { describe, expect, it } from 'vitest';
import {
  CASH_BILL_LOGICAL_HEIGHT,
  CASH_GRAB_MARGIN_PIXELS,
  advanceCashDrawSession,
  createInitialCashDrawState,
  isPointInsideCashGrabArea,
} from '../../src/core/cash/draw-judgment';

/**
 * 抽钞判定单测（任务 3.1 验证入口，对应 cash-drawing 规格 R2/R3/R4/R5）：
 * 35% 完成阈值、回收路径不计计数、宽容抓取余量、轻点无效、动画可中断。
 */

const WALLET_MOUTH_RECT = { left: 130, top: 480, width: 120, height: 40 };

function grabAndDrag(dragDeltaYPixels: number[]) {
  const collectedEffects: string[] = [];
  let currentUpdate = advanceCashDrawSession(createInitialCashDrawState(), { type: 'grab' });
  collectedEffects.push(...currentUpdate.effects.map((effect) => effect.type));
  for (const dragDeltaY of dragDeltaYPixels) {
    currentUpdate = advanceCashDrawSession(currentUpdate.state, { type: 'drag', dragDeltaY });
    collectedEffects.push(...currentUpdate.effects.map((effect) => effect.type));
  }
  return { finalState: currentUpdate.state, collectedEffects };
}

describe('抽钞判定：抓取与跟手位移', () => {
  it('初始为 idle，抓取后进入 dragging', () => {
    const initialState = createInitialCashDrawState();
    expect(initialState.phase).toBe('idle');
    const grabUpdate = advanceCashDrawSession(initialState, { type: 'grab' });
    expect(grabUpdate.state.phase).toBe('dragging');
  });

  it('向上拖拽换算为抽出比例（0.5 张高度 × 0.75 跟手增益 → 0.375，更粘）', () => {
    const { finalState } = grabAndDrag([CASH_BILL_LOGICAL_HEIGHT * 0.5]);
    expect(finalState.pulledOutRatio).toBeCloseTo(0.375, 5);
  });

  it('抽出比例钳制在 1（拖出超过整张不越界）', () => {
    const { finalState } = grabAndDrag([CASH_BILL_LOGICAL_HEIGHT * 2]);
    expect(finalState.pulledOutRatio).toBe(1);
  });

  it('idle 状态下的 drag/release 事件被安全忽略', () => {
    const idleState = createInitialCashDrawState();
    const dragUpdate = advanceCashDrawSession(idleState, { type: 'drag', dragDeltaY: 50 });
    expect(dragUpdate.state.phase).toBe('idle');
    const releaseUpdate = advanceCashDrawSession(idleState, { type: 'release' });
    expect(releaseUpdate.effects).toEqual([]);
  });
});

describe('抽钞判定：松手阈值（规格 R3）', () => {
  it('抽出 ≥35% 松手 → follow-through 完成路径并计数', () => {
    const { finalState } = grabAndDrag([CASH_BILL_LOGICAL_HEIGHT * 0.5]);
    const releaseUpdate = advanceCashDrawSession(finalState, { type: 'release' });
    expect(releaseUpdate.state.phase).toBe('completing');
    expect(releaseUpdate.effects.map((effect) => effect.type)).toContain(
      'bill-follow-through-began',
    );

    const settledUpdate = advanceCashDrawSession(releaseUpdate.state, {
      type: 'animation-finished',
    });
    expect(settledUpdate.state.phase).toBe('idle');
    expect(settledUpdate.effects.map((effect) => effect.type)).toContain(
      'bill-draw-completed',
    );
  });

  it('抽出 <35% 松手 → 回收路径且不计数（规格：未过阈值松手）', () => {
    const { finalState } = grabAndDrag([CASH_BILL_LOGICAL_HEIGHT * 0.2]);
    const releaseUpdate = advanceCashDrawSession(finalState, { type: 'release' });
    expect(releaseUpdate.state.phase).toBe('recycling');
    expect(releaseUpdate.effects.map((effect) => effect.type)).toContain('bill-recycle-began');

    const recycledUpdate = advanceCashDrawSession(releaseUpdate.state, {
      type: 'animation-finished',
    });
    expect(recycledUpdate.state.phase).toBe('idle');
    expect(recycledUpdate.effects).toEqual([]);
  });
});

describe('抽钞判定：轻点不完成', () => {
  it('零位移松手直接回到静止态，无效果', () => {
    const { finalState } = grabAndDrag([0]);
    const releaseUpdate = advanceCashDrawSession(finalState, { type: 'release' });
    expect(releaseUpdate.state.phase).toBe('idle');
    expect(releaseUpdate.effects).toEqual([]);
  });

  it('微位移松手进入回收路径且不计数', () => {
    const { finalState } = grabAndDrag([6]);
    const releaseUpdate = advanceCashDrawSession(finalState, { type: 'release' });
    expect(releaseUpdate.state.phase).toBe('recycling');
    expect(releaseUpdate.effects.map((effect) => effect.type)).not.toContain('bill-follow-through-began');
    const settledUpdate = advanceCashDrawSession(releaseUpdate.state, { type: 'animation-finished' });
    expect(settledUpdate.effects).toEqual([]);
  });
});

describe('抽钞判定：动画中断接管（规格 R2 可中断 + 连抽结算）', () => {
  it('completing 中再次抓取 → 在途张立即结算计数并开新会话，比例归零', () => {
    const { finalState } = grabAndDrag([CASH_BILL_LOGICAL_HEIGHT * 0.5]);
    const releaseUpdate = advanceCashDrawSession(finalState, { type: 'release' });
    const regrabUpdate = advanceCashDrawSession(releaseUpdate.state, { type: 'grab' });
    expect(regrabUpdate.state.phase).toBe('dragging');
    expect(regrabUpdate.state.pulledOutRatio).toBe(0);
    // 在途张已过完成阈值：再抓取即结算，不许吞计数（rapid-draw-settlement）
    expect(regrabUpdate.effects).toEqual([{ type: 'bill-draw-completed' }]);
  });

  it('recycling 中再次抓取 → 纯重置，不产生结算效果（未过阈值不计）', () => {
    const { finalState } = grabAndDrag([CASH_BILL_LOGICAL_HEIGHT * 0.1]);
    const releaseUpdate = advanceCashDrawSession(finalState, { type: 'release' });
    expect(releaseUpdate.state.phase).toBe('recycling');
    const regrabUpdate = advanceCashDrawSession(releaseUpdate.state, { type: 'grab' });
    expect(regrabUpdate.state.phase).toBe('dragging');
    expect(regrabUpdate.state.pulledOutRatio).toBe(0);
    expect(regrabUpdate.effects).toEqual([]);
  });

  it('idle / dragging 中抓取 → 原样重置，无效果', () => {
    const idleGrab = advanceCashDrawSession(createInitialCashDrawState(), { type: 'grab' });
    expect(idleGrab.state.phase).toBe('dragging');
    expect(idleGrab.effects).toEqual([]);
    const { finalState } = grabAndDrag([CASH_BILL_LOGICAL_HEIGHT * 0.2]);
    const draggingGrab = advanceCashDrawSession(finalState, { type: 'grab' });
    expect(draggingGrab.state.pulledOutRatio).toBe(0);
    expect(draggingGrab.effects).toEqual([]);
  });
});

describe('抽钞判定：宽容抓取热区（规格 R5）', () => {
  it('钱包口矩形内的点命中', () => {
    expect(isPointInsideCashGrabArea({ x: 190, y: 500 }, WALLET_MOUTH_RECT)).toBe(true);
  });

  it('余量扩边：口外沿 18px 内仍可抓取', () => {
    expect(
      isPointInsideCashGrabArea(
        { x: 190, y: WALLET_MOUTH_RECT.top - CASH_GRAB_MARGIN_PIXELS + 1 },
        WALLET_MOUTH_RECT,
      ),
    ).toBe(true);
    expect(
      isPointInsideCashGrabArea(
        { x: 190, y: WALLET_MOUTH_RECT.top - CASH_GRAB_MARGIN_PIXELS - 1 },
        WALLET_MOUTH_RECT,
      ),
    ).toBe(false);
  });

  it('远离钱包口的点不命中', () => {
    expect(isPointInsideCashGrabArea({ x: 30, y: 120 }, WALLET_MOUTH_RECT)).toBe(false);
  });
});
