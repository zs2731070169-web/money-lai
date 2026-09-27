import { describe, expect, it } from 'vitest';
import {
  SCATTER_DRAG_UP_RELEASE_THRESHOLD_PX,
  advanceScatterSession,
  createInitialScatterState,
} from '../../src/core/worry/scatter-state';

/** 放飞状态机单测（worry-release 规格「放飞触发与取消」，任务 1.1）。 */

describe('scatter-state 放飞状态机', () => {
  it('按下即凝沓：无计时门槛，偏移归零', () => {
    const update = advanceScatterSession(createInitialScatterState(), { type: 'press' });
    expect(update.state.phase).toBe('grasped');
    expect(update.state.dragOffsetUpPixels).toBe(0);
    expect(update.outcome).toBeNull();
  });

  it('grasped 中重复按下被吸收', () => {
    const grasped = advanceScatterSession(createInitialScatterState(), { type: 'press' });
    const again = advanceScatterSession(grasped.state, { type: 'press' });
    expect(again.state).toBe(grasped.state);
    expect(again.outcome).toBeNull();
  });

  it('上拖累计偏移：正负自然抵消（拖下再拖上）', () => {
    let state = advanceScatterSession(createInitialScatterState(), { type: 'press' }).state;
    state = advanceScatterSession(state, { type: 'drag', deltaUpPixels: 60 }).state;
    state = advanceScatterSession(state, { type: 'drag', deltaUpPixels: -45 }).state;
    expect(state.dragOffsetUpPixels).toBe(15);
  });

  it('idle 中的 drag/release 被安全忽略', () => {
    const initial = createInitialScatterState();
    expect(advanceScatterSession(initial, { type: 'drag', deltaUpPixels: 100 }).state).toBe(
      initial,
    );
    expect(advanceScatterSession(initial, { type: 'release' }).outcome).toBeNull();
  });

  it('高处松手=放飞结算（阈值边界恰达）', () => {
    let update = advanceScatterSession(createInitialScatterState(), { type: 'press' });
    update = advanceScatterSession(update.state, {
      type: 'drag',
      deltaUpPixels: SCATTER_DRAG_UP_RELEASE_THRESHOLD_PX,
    });
    update = advanceScatterSession(update.state, { type: 'release' });
    expect(update.outcome).toBe('scatter-released');
    expect(update.state.phase).toBe('released');
  });

  it('原位松手=取消回落，无状态残留', () => {
    let update = advanceScatterSession(createInitialScatterState(), { type: 'press' });
    update = advanceScatterSession(update.state, { type: 'drag', deltaUpPixels: 20 });
    update = advanceScatterSession(update.state, { type: 'release' });
    expect(update.outcome).toBe('scatter-cancelled');
    expect(update.state).toEqual(createInitialScatterState());
  });

  it('拖回按下点之下松手=取消（负偏移同样不算放飞）', () => {
    let update = advanceScatterSession(createInitialScatterState(), { type: 'press' });
    update = advanceScatterSession(update.state, { type: 'drag', deltaUpPixels: -30 });
    update = advanceScatterSession(update.state, { type: 'release' });
    expect(update.outcome).toBe('scatter-cancelled');
  });

  it('released 为终态：后续事件被吸收，消费方复位后再可用', () => {
    let update = advanceScatterSession(createInitialScatterState(), { type: 'press' });
    update = advanceScatterSession(update.state, { type: 'drag', deltaUpPixels: 100 });
    update = advanceScatterSession(update.state, { type: 'release' });
    expect(update.outcome).toBe('scatter-released');
    const afterRelease = advanceScatterSession(update.state, { type: 'drag', deltaUpPixels: 50 });
    expect(afterRelease.state).toBe(update.state);
    // 复位后可再次发起
    const restarted = advanceScatterSession(createInitialScatterState(), { type: 'press' });
    expect(restarted.state.phase).toBe('grasped');
  });
});
