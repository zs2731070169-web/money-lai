import { describe, expect, it } from 'vitest';
import {
  AFTERGLOW_DURATION_MS, BURN_DURATION_MS, MAX_FRAME_DELTA_MS, MAX_LETTER_TEXT_LENGTH, SILENCE_DURATION_MS,
  REDUCED_REBOUND_DURATION_MS, REDUCED_UNFOLD_DURATION_MS, STAT_DURATION_MS, UNFOLD_DURATION_MS,
  advanceBurningState, beginDraw, beginThrow, createBurningState,
  beginEditing, endDraw, endThrow, finishEditing, movePointer, resolveCount, setPostcardText,
  type BurningState,
} from '../../src/core/letter/burning-state';

function advanceUntil(state: ReturnType<typeof createBurningState>, phase: string) {
  let current = state;
  const effects: string[] = [];
  for (let index = 0; index < 200 && current.phase !== phase; index += 1) {
    const update = advanceBurningState(current, 100);
    current = update.state;
    effects.push(...update.effects);
  }
  return { state: current, effects };
}

describe('燃信纯状态机', () => {
  it('沿完整路径前进，并锁定展开、燃烧、余光、静默与统计时长', () => {
    let state = beginDraw(createBurningState(), 1, 700, 0);
    state = movePointer(state, 1, 600, 100);
    state = endDraw(state, 1).state;
    expect(state.phase).toBe('unfold');
    state = advanceUntil(state, 'edit').state;
    expect(UNFOLD_DURATION_MS).toBe(450);
    state = setPostcardText(state, '一句话\n仍是一行');
    expect(state.text).toBe('一句话\n仍是一行');
    state = [100, 100, 100, 100].reduce((current) => advanceBurningState(current, 100).state, finishEditing(state));
    expect(state.phase).toBe('back');
    state = beginThrow(state, 1, 650, 200);
    state = movePointer(state, 1, 500, 350);
    const released = endThrow(state, 1, 500, 350, 800, true);
    expect(released.state.phase).toBe('burn');
    expect(released.effects).toEqual([]);
    const fade = advanceUntil(released.state, 'fade');
    expect(fade.effects).toEqual(expect.arrayContaining(['save', 'afterglow', 'extinguish']));
    expect(BURN_DURATION_MS).toBe(2700);
    const silence = advanceUntil(resolveCount(fade.state, 42), 'silence');
    expect(AFTERGLOW_DURATION_MS).toBe(800);
    const stat = advanceUntil(silence.state, 'stat');
    expect(SILENCE_DURATION_MS).toBe(1800);
    const idle = advanceUntil(stat.state, 'idle');
    expect(STAT_DURATION_MS).toBe(3000);
    expect(idle.effects).toContain('reset');
  });

  it('展开相位保留抽取位移作为动画起点，跨相位推进不丢剩余毫秒', () => {
    // 抽出 100px 后释放：进入展开相位时保留 offsetY 供画师插值，展开结束后清零
    const release = endDraw(movePointer(beginDraw(createBurningState(), 1, 700, 0), 1, 600, 100), 1);
    const released = release.state;
    // 抽出成功只在瞬间发出一次 'drawn'（摩擦声触发点），未达阈值回弹则无效果
    expect(release.effects).toEqual(['drawn']);
    expect(endDraw(movePointer(beginDraw(createBurningState(), 1, 700, 0), 1, 690, 100), 1).effects).toEqual([]);
    expect(released.phase).toBe('unfold');
    expect(released.offsetY).toBe(-85);
    const partial = advanceBurningState({ ...released, elapsedMs: UNFOLD_DURATION_MS - 50 }, 80).state;
    expect(partial.phase).toBe('edit');
    expect(partial.offsetY).toBe(0);
  });

  it('减弱动态效果时展开缩短为 150ms', () => {
    const released = endDraw(movePointer(beginDraw(createBurningState(), 1, 700, 0), 1, 600, 100), 1).state;
    let state = advanceBurningState(released, 100, true).state;
    expect(state.phase).toBe('unfold');
    state = advanceBurningState(state, REDUCED_UNFOLD_DURATION_MS - 100, true).state;
    expect(state.phase).toBe('edit');
  });

  it('位移达到屏高 15% 或速度超过 700px/s 时燃烧', () => {
    const editing = advanceUntil(endDraw(movePointer(beginDraw(createBurningState(), 1, 700, 0), 1, 600, 100), 1).state, 'edit').state;
    const back = [100, 100, 100, 100].reduce((current) => advanceBurningState(current, 100).state, finishEditing(editing));
    const byDistance = endThrow(beginThrow(back, 2, 600, 0), 2, 480, 500, 800, false);
    expect(byDistance.state.phase).toBe('burn');
    const bySpeed = endThrow(beginThrow(back, 3, 600, 0), 3, 520, 100, 800, false);
    expect(bySpeed.state.phase).toBe('burn');
  });

  it('未达阈值 300ms 回弹，文字不丢失', () => {
    let state: BurningState = { ...createBurningState(), phase: 'back', text: '保留' };
    state = beginThrow(state, 1, 500, 0);
    state = endThrow(state, 1, 480, 200, 800, false).state;
    expect(state.phase).toBe('rebound');
    state = advanceBurningState(state, 100).state;
    state = advanceBurningState(state, 100).state;
    state = advanceBurningState(state, 100).state;
    expect(state.phase).toBe('back');
    expect(state.text).toBe('保留');
  });

  it('燃烧开始后忽略触点，后台大步长只推进 100ms', () => {
    const burning = { ...createBurningState(), phase: 'burn' as const, pointerId: null };
    expect(beginDraw(burning, 2, 100, 0)).toBe(burning);
    const advanced = advanceBurningState(burning, 10_000).state;
    expect(advanced.phase).toBe('burn');
    expect(advanced.elapsedMs).toBe(MAX_FRAME_DELTA_MS);
  });

  it('跨相位保留剩余毫秒，回弹轨迹不依赖帧数', () => {
    const nearFade: BurningState = { ...createBurningState(), phase: 'burn', elapsedMs: BURN_DURATION_MS - 50 };
    const crossed = advanceBurningState(nearFade, 80);
    expect(crossed.state.phase).toBe('fade');
    expect(crossed.state.elapsedMs).toBe(30);

    const rebound: BurningState = { ...createBurningState(), phase: 'rebound', offsetY: -40, reboundStartOffsetY: -40 };
    const threeFrames = [100, 100, 100].reduce((current, delta) => advanceBurningState(current, delta).state, rebound);
    const sixFrames = [50, 50, 50, 50, 50, 50].reduce((current, delta) => advanceBurningState(current, delta).state, rebound);
    expect(threeFrames).toEqual(sixFrames);
    expect(threeFrames.phase).toBe('back');
  });

  it('减弱动态效果只缩短非关键回弹', () => {
    const rebound: BurningState = { ...createBurningState(), phase: 'rebound', offsetY: -40, reboundStartOffsetY: -40 };
    let state = advanceBurningState(rebound, 100, true).state;
    expect(state.phase).toBe('rebound');
    state = advanceBurningState(state, REDUCED_REBOUND_DURATION_MS - 100, true).state;
    expect(state.phase).toBe('back');
  });

  it('编辑态保留换行并把特殊符号计入字数上限，退出后回缩到背面', () => {
    expect(MAX_LETTER_TEXT_LENGTH).toBe(400);
    const front = { ...createBurningState(), phase: 'front' as const };
    const editing = beginEditing(front);
    // 超上限构造：换行与表情均按 Unicode 码点计入，截断到 MAX_LETTER_TEXT_LENGTH
    const source = `${'字'.repeat(MAX_LETTER_TEXT_LENGTH - 2)}\n${'字'.repeat(10)}😀末尾`;
    const written = setPostcardText(editing, source);
    expect(written.phase).toBe('edit');
    expect(Array.from(written.text)).toHaveLength(MAX_LETTER_TEXT_LENGTH);
    expect(written.text.includes('\n')).toBe(true);
    const returning = finishEditing(written);
    expect(returning.phase).toBe('edit-return');
    // 单帧增量被 MAX_FRAME_DELTA_MS=100 钳制，回缩到背面需分帧推进
    expect(advanceUntil(returning, 'back').state.phase).toBe('back');
  });
});
