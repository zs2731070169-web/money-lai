import { describe, expect, it } from 'vitest';
import {
  WALLET_FLAP_FOLD_CLOSE_DURATION_MS,
  WALLET_FLAP_FOLD_OPEN_DURATION_MS,
  WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
  advanceWalletFlap,
  createInitialWalletFlapState,
  walletFlapClosePhysicalProfile,
} from '../../src/core/wallet/flap-state';

/**
 * 翻盖状态机单测（触发语义 + 真实物理剖面版，任务 12.2，wallet-interaction 规格 v2.3）。
 */

/** 便捷链：按下后逐段滑动 */
function pressAndSwipe(swipeDeltaYPixels: number[]) {
  const collectedEffects: string[] = [];
  let currentUpdate = advanceWalletFlap(createInitialWalletFlapState(), { type: 'press' });
  collectedEffects.push(...currentUpdate.effects.map((effect) => effect.type));
  for (const deltaY of swipeDeltaYPixels) {
    currentUpdate = advanceWalletFlap(currentUpdate.state, { type: 'swipe', deltaY });
    collectedEffects.push(...currentUpdate.effects.map((effect) => effect.type));
  }
  return { finalState: currentUpdate.state, collectedEffects };
}

/** 构造稳定开启态：触发开折叠并完整推进时间线 */
function createOpenedFlapState() {
  let state = pressAndSwipe([WALLET_FLAP_SWIPE_TRIGGER_DISTANCE]).finalState;
  for (let stepIndex = 0; stepIndex < 80; stepIndex += 1) {
    state = advanceWalletFlap(state, { type: 'advance', deltaMs: 33 }).state;
  }
  return state;
}

/** 有限差分估计剖面速度 */
function profileVelocityAt(profile: (u: number) => number, u: number, h = 0.01): number {
  return (profile(u + h) - profile(u - h)) / (2 * h);
}

describe('触发语义：滑动即信号、不跟手', () => {
  it('初始为关闭、进度 0；按下进入滑动累计', () => {
    const initialState = createInitialWalletFlapState();
    expect(initialState.phase).toBe('closed');
    expect(initialState.openProgress).toBe(0);
    const pressUpdate = advanceWalletFlap(initialState, { type: 'press' });
    expect(pressUpdate.state.phase).toBe('pressing');
  });

  it('上滑达阈值即时触发折叠，触发前翻盖保持静止（不跟手）', () => {
    const { finalState, collectedEffects } = pressAndSwipe([15, 13]);
    expect(collectedEffects).toContain('fold-started');
    expect(finalState.phase).toBe('folding');
    expect(finalState.foldTarget).toBe(1);
  });

  it('未达阈值松手 → 无动作回到稳定态', () => {
    const { finalState } = pressAndSwipe([15]);
    const releaseUpdate = advanceWalletFlap(finalState, { type: 'release' });
    expect(releaseUpdate.state.phase).toBe('closed');
    expect(releaseUpdate.effects).toEqual([]);
  });

  it('关闭态下滑触发被吸收（无可折叠目标）', () => {
    const { finalState, collectedEffects } = pressAndSwipe([-30]);
    expect(finalState.phase).toBe('pressing');
    expect(collectedEffects).not.toContain('fold-started');
  });
});

describe('开启物理剖面（用户手调定稿：与关闭共用三段剖面，无过冲）', () => {
  it('端点正确：profile(0)=0、profile(1)=1、全程不越过 1', () => {
    expect(walletFlapClosePhysicalProfile(0)).toBe(0);
    expect(walletFlapClosePhysicalProfile(1)).toBeCloseTo(1, 6);
    for (let sample = 0; sample <= 100; sample += 1) {
      expect(walletFlapClosePhysicalProfile(sample / 100)).toBeLessThanOrEqual(1.0001);
    }
  });

  it('advance 集成：42% 时刻处于三段剖面前段（慢起）、终点收敛 1', () => {
    let state = pressAndSwipe([WALLET_FLAP_SWIPE_TRIGGER_DISTANCE]).finalState;
    state = advanceWalletFlap(state, {
      type: 'advance',
      deltaMs: WALLET_FLAP_FOLD_OPEN_DURATION_MS * 0.42,
    }).state;
    expect(state.openProgress).toBeGreaterThan(0.05);
    expect(state.openProgress).toBeLessThan(0.45);
    state = advanceWalletFlap(state, {
      type: 'advance',
      deltaMs: WALLET_FLAP_FOLD_OPEN_DURATION_MS,
    }).state;
    expect(state.phase).toBe('open');
    expect(state.openProgress).toBe(1);
  });
});

describe('关闭物理剖面：重力下落 → 垫着陆（无弹跳）', () => {
  it('单调到达 1，不越过终点（无下过冲）', () => {
    expect(walletFlapClosePhysicalProfile(0)).toBe(0);
    expect(walletFlapClosePhysicalProfile(1)).toBeCloseTo(1, 6);
    let previous = 0;
    for (let sample = 0; sample <= 100; sample += 1) {
      const value = walletFlapClosePhysicalProfile(sample / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(value).toBeLessThanOrEqual(1.0001);
      previous = value;
    }
  });

  it('速度剖面：下落段快、垫住段显著减速', () => {
    const fallVelocity = profileVelocityAt(walletFlapClosePhysicalProfile, 0.4);
    const cushionVelocity = profileVelocityAt(walletFlapClosePhysicalProfile, 0.8);
    expect(fallVelocity).toBeGreaterThan(cushionVelocity * 1.5);
  });

  it('advance 集成：从开启态收敛到 closed 且进度恰为 0', () => {
    const openedState = createOpenedFlapState();
    expect(openedState.phase).toBe('open');
    let state = advanceWalletFlap(openedState, { type: 'press' }).state;
    state = advanceWalletFlap(state, {
      type: 'swipe',
      deltaY: -WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
    }).state;
    state = advanceWalletFlap(state, {
      type: 'advance',
      deltaMs: WALLET_FLAP_FOLD_CLOSE_DURATION_MS + 50,
    }).state;
    expect(state.phase).toBe('closed');
    expect(state.openProgress).toBe(0);
  });
});

describe('关闭触面效果（掀有声、合有拍）', () => {
  it('关闭折叠在触面瞬间恰好发射一次 fold-contact', () => {
    const openedState = createOpenedFlapState();
    let state = advanceWalletFlap(openedState, { type: 'press' }).state;
    state = advanceWalletFlap(state, {
      type: 'swipe',
      deltaY: -WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
    }).state;
    const contactEffects: string[] = [];
    for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
      const update = advanceWalletFlap(state, { type: 'advance', deltaMs: 33 });
      state = update.state;
      contactEffects.push(...update.effects.map((effect) => effect.type));
    }
    expect(contactEffects.filter((type) => type === 'fold-contact').length).toBe(1);
  });

  it('开启折叠不发射 fold-contact', () => {
    let state = pressAndSwipe([WALLET_FLAP_SWIPE_TRIGGER_DISTANCE]).finalState;
    const contactEffects: string[] = [];
    for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
      const update = advanceWalletFlap(state, { type: 'advance', deltaMs: 33 });
      state = update.state;
      contactEffects.push(...update.effects.map((effect) => effect.type));
    }
    expect(contactEffects).not.toContain('fold-contact');
  });
});

describe('折叠途中语义', () => {
  it('反向滑动达阈值 → 从当前进度连续转向（无跳变）', () => {
    let state = pressAndSwipe([WALLET_FLAP_SWIPE_TRIGGER_DISTANCE]).finalState;
    state = advanceWalletFlap(state, { type: 'advance', deltaMs: 400 }).state;
    const midFoldProgress = state.openProgress;
    expect(midFoldProgress).toBeGreaterThan(0);
    const turnUpdate = advanceWalletFlap(state, {
      type: 'swipe',
      deltaY: -WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
    });
    expect(turnUpdate.state.foldTarget).toBe(0);
    expect(turnUpdate.state.foldStartProgress).toBeCloseTo(midFoldProgress, 5);
    // 转向后第一步仍从当前进度附近继续（连续性）
    const nextStep = advanceWalletFlap(turnUpdate.state, { type: 'advance', deltaMs: 16 });
    expect(Math.abs(nextStep.state.openProgress - midFoldProgress)).toBeLessThan(0.06);
  });

  it('同向滑动被吸收；折叠期间按下被吸收', () => {
    const state = pressAndSwipe([WALLET_FLAP_SWIPE_TRIGGER_DISTANCE]).finalState;
    const sameDirectionUpdate = advanceWalletFlap(state, {
      type: 'swipe',
      deltaY: WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
    });
    expect(sameDirectionUpdate.effects).toEqual([]);
    const pressUpdate = advanceWalletFlap(state, { type: 'press' });
    expect(pressUpdate.state.phase).toBe('folding');
    expect(pressUpdate.effects).toEqual([]);
  });
});

describe('翻盖仅由滑动触发', () => {
  it('关闭态和开启态轻点均保持原状态且没有折叠效果', () => {
    const { finalState } = pressAndSwipe([3]);
    const releaseUpdate = advanceWalletFlap(finalState, { type: 'release' });
    expect(releaseUpdate.state.phase).toBe('closed');
    expect(releaseUpdate.effects).toEqual([]);

    const openedState = createOpenedFlapState();
    const state = advanceWalletFlap(openedState, { type: 'press' }).state;
    const closeRelease = advanceWalletFlap(state, { type: 'release' });
    expect(closeRelease.state.phase).toBe('open');
    expect(closeRelease.effects).toEqual([]);
  });
});
