import { describe, expect, it } from 'vitest';
import {
  SLEEP_DIM_FADE_DURATION_MS,
  SLEEP_DIM_IDLE_THRESHOLD_MS,
  SLEEP_NEAR_BLACK_BRIGHTNESS,
  SLEEP_NIGHT_BASE_BRIGHTNESS,
  advanceSleepArc,
  createInitialSleepArcState,
} from '../../src/core/sleep/sleep-arc';

/** 睡眠弧线状态机单测（sleep-mode 规格「渐进熄灭」，任务 1.3）。 */

describe('sleep-arc 渐进熄灭时序', () => {
  it('静置未达阈值：保持 idle 与基准亮度', () => {
    const state = createInitialSleepArcState(0);
    const update = advanceSleepArc(state, { type: 'advance', nowMs: SLEEP_DIM_IDLE_THRESHOLD_MS - 1 });
    expect(update.state.phase).toBe('idle');
    expect(update.brightness).toBeCloseTo(SLEEP_NIGHT_BASE_BRIGHTNESS);
    expect(update.reachedSleepPoint).toBe(false);
  });

  it('达到阈值进入渐暗：亮度开始下降', () => {
    const state = createInitialSleepArcState(0);
    const update = advanceSleepArc(state, { type: 'advance', nowMs: SLEEP_DIM_IDLE_THRESHOLD_MS + 1 });
    expect(update.state.phase).toBe('dimming');
    expect(update.brightness).toBeLessThan(SLEEP_NIGHT_BASE_BRIGHTNESS);
    expect(update.reachedSleepPoint).toBe(false);
  });

  it('渐暗中段：亮度约为一半（线性剖面）', () => {
    const state = createInitialSleepArcState(0);
    const midpointMs = SLEEP_DIM_IDLE_THRESHOLD_MS + SLEEP_DIM_FADE_DURATION_MS / 2;
    const update = advanceSleepArc(state, { type: 'advance', nowMs: midpointMs });
    expect(update.state.phase).toBe('dimming');
    const expectedMidpoint =
      (SLEEP_NIGHT_BASE_BRIGHTNESS + SLEEP_NEAR_BLACK_BRIGHTNESS) / 2;
    expect(update.brightness).toBeCloseTo(expectedMidpoint, 2);
  });

  it('渐暗完成：近黑稳态并恰好发射一次入睡点', () => {
    const state = createInitialSleepArcState(0);
    const doneMs = SLEEP_DIM_IDLE_THRESHOLD_MS + SLEEP_DIM_FADE_DURATION_MS;
    const update = advanceSleepArc(state, { type: 'advance', nowMs: doneMs });
    expect(update.state.phase).toBe('dimmed');
    expect(update.brightness).toBeCloseTo(SLEEP_NEAR_BLACK_BRIGHTNESS);
    expect(update.reachedSleepPoint).toBe(true);
    expect(update.state.sealed).toBe(true);
  });

  it('封存幂等：dimmed 后重复推进不再发射入睡点', () => {
    const doneMs = SLEEP_DIM_IDLE_THRESHOLD_MS + SLEEP_DIM_FADE_DURATION_MS;
    const first = advanceSleepArc(createInitialSleepArcState(0), { type: 'advance', nowMs: doneMs });
    const second = advanceSleepArc(first.state, { type: 'advance', nowMs: doneMs + 5_000 });
    expect(second.reachedSleepPoint).toBe(false);
    expect(second.state.sealed).toBe(true);
    expect(second.brightness).toBeCloseTo(SLEEP_NEAR_BLACK_BRIGHTNESS);
  });

  it('计时器冻结补偿：一次跨阈值大跳变直接落到 dimmed 并封存', () => {
    // 锁屏 10 分钟后回前台：单次 advance 补判到位，无需逐帧追赶
    const update = advanceSleepArc(createInitialSleepArcState(0), { type: 'advance', nowMs: 600_000 });
    expect(update.state.phase).toBe('dimmed');
    expect(update.reachedSleepPoint).toBe(true);
  });

  it('交互重置计时：亮度恢复基准，sealed 保持（同夜不二次封存）', () => {
    const doneMs = SLEEP_DIM_IDLE_THRESHOLD_MS + SLEEP_DIM_FADE_DURATION_MS;
    const dimmed = advanceSleepArc(createInitialSleepArcState(0), { type: 'advance', nowMs: doneMs });
    const woken = advanceSleepArc(dimmed.state, { type: 'interaction', nowMs: doneMs + 1_000 });
    expect(woken.state.phase).toBe('idle');
    expect(woken.state.lastInteractionAtMs).toBe(doneMs + 1_000);
    expect(woken.brightness).toBeCloseTo(SLEEP_NIGHT_BASE_BRIGHTNESS);
    expect(woken.state.sealed).toBe(true);
  });

  it('再次熄灭不重复封存（同夜一条记录）', () => {
    const doneMs = SLEEP_DIM_IDLE_THRESHOLD_MS + SLEEP_DIM_FADE_DURATION_MS;
    const dimmed = advanceSleepArc(createInitialSleepArcState(0), { type: 'advance', nowMs: doneMs });
    const woken = advanceSleepArc(dimmed.state, { type: 'interaction', nowMs: doneMs + 1_000 });
    const again = advanceSleepArc(woken.state, {
      type: 'advance',
      nowMs: doneMs + 1_000 + doneMs,
    });
    expect(again.state.phase).toBe('dimmed');
    expect(again.reachedSleepPoint).toBe(false);
  });

  it('亮度随推进单调不回升（静置期间）', () => {
    let state = createInitialSleepArcState(0);
    let previousBrightness = Number.POSITIVE_INFINITY;
    for (let nowMs = 0; nowMs <= 200_000; nowMs += 5_000) {
      const update = advanceSleepArc(state, { type: 'advance', nowMs });
      expect(update.brightness).toBeLessThanOrEqual(previousBrightness + 1e-9);
      previousBrightness = update.brightness;
      state = update.state;
    }
    expect(previousBrightness).toBeCloseTo(SLEEP_NEAR_BLACK_BRIGHTNESS);
  });
});
