import { describe, expect, it } from 'vitest';
import {
  MAX_FRAME_DELTA_MS, MAX_LETTER_TEXT_LENGTH, QUIET_DURATION_MS, REBOUND_DURATION_MS, REDUCED_UNFOLD_DURATION_MS,
  SETTLE_DURATION_MS, STAT_DURATION_MS, UNFOLD_DURATION_MS,
  advanceLetterState, beginDispatchLocalTuck, beginDispatchSend, beginDraw, beginEditing, beginTuck, cancelDispatch, cancelDispatchSend, confirmDispatchSend, createLetterState,
  endDraw, endTuck, finishEditing, movePointer, resolveCount, setPostcardText,
  type LetterState,
} from '../../src/core/letter/letter-state';

/** 展示位上滑释放：写好文字并回缩停住后，从展示位起拖到 y2 释放 */
function swipeToTuck(state: LetterState, fromY: number, toY: number, durationMs = 200, viewportHeight = 800, wantsStat = true) {
  const dragged = movePointer(beginTuck(state, 2, fromY, 0), 2, toY, durationMs);
  return endTuck(dragged, 2, toY, durationMs, viewportHeight, wantsStat);
}

/** 推进到 back（编辑回缩或回弹终点） */
function toBack(state: LetterState): LetterState {
  return advanceUntil(state, 'back').state;
}

function advanceUntil(state: ReturnType<typeof createLetterState>, phase: string, reducedMotion = false) {
  let current = state;
  const effects: string[] = [];
  for (let index = 0; index < 200 && current.phase !== phase; index += 1) {
    const update = advanceLetterState(current, 100, reducedMotion);
    current = update.state;
    effects.push(...update.effects);
  }
  return { state: current, effects };
}

function drawnToEdit(): LetterState {
  const drawn = endDraw(movePointer(beginDraw(createLetterState(), 1, 700, 0), 1, 600, 100), 1);
  return advanceUntil(drawn.state, 'edit').state;
}

describe('倾诉收好纯状态机', () => {
  it('沿完整路径前进：书写→确认回展示位→上滑收好→保存→统计→复位，并锁定各时长', () => {
    let state = setPostcardText(drawnToEdit(), '一句话\n仍是一行');
    expect(UNFOLD_DURATION_MS).toBe(450);
    // 确认只回展示位：不自动收好、无 save
    const returned = advanceUntil(finishEditing(state), 'back');
    expect(returned.state.phase).toBe('back');
    expect(returned.effects).not.toContain('save');
    const tuck = swipeToTuck(returned.state, 650, 480);
    expect(tuck.state.phase).toBe('dispatch');
    const localTuck = beginDispatchLocalTuck(tuck.state);
    expect(localTuck.phase).toBe('settle');
    const settled = advanceUntil(localTuck, 'quiet');
    expect(settled.state.phase).toBe('quiet');
    expect(settled.effects).toContain('save');
    expect(SETTLE_DURATION_MS).toBe(450);
    const stat = advanceUntil(resolveCount(settled.state, 42), 'stat');
    expect(QUIET_DURATION_MS).toBe(1500);
    expect(stat.state.phase).toBe('stat');
    const idle = advanceUntil(stat.state, 'idle');
    expect(STAT_DURATION_MS).toBe(3000);
    // 复位保留这封信的原文：抽出后原文字完整可见，可继续编辑
    expect(idle.state.text).toBe('一句话\n仍是一行');
    expect(idle.effects).toContain('reset');
  });

  it('上滑释放先进入寄送抉择：信纸停在展示位，未落袋未保存', () => {
    const back = toBack(finishEditing(setPostcardText(drawnToEdit(), '抉择的信')));
    const dispatch = swipeToTuck(back, 650, 480);
    expect(dispatch.state.phase).toBe('dispatch');
    expect(dispatch.state.text).toBe('抉择的信');
    expect(dispatch.effects).not.toContain('save');
  });

  it('抉择·本地收好：走既有 settle 链路落库；抉择·寄出确认后同样入 settle 并发 requestSend', () => {
    const back = toBack(finishEditing(setPostcardText(drawnToEdit(), '信')));
    const dispatch = swipeToTuck(back, 650, 480).state;
    const local = beginDispatchLocalTuck(dispatch);
    expect(local.phase).toBe('settle');
    const settled = advanceUntil(local, 'quiet');
    expect(settled.effects).toContain('save');

    const dispatch2 = swipeToTuck(back, 650, 480).state;
    const sent = confirmDispatchSend(beginDispatchSend(dispatch2));
    expect(sent.state.phase).toBe('settle');
    expect(sent.effects).toContain('requestSend');
  });

  it('寄出输入取消回抉择，抉择取消回展示位；抉择期间触摸全隔离', () => {
    const back = toBack(finishEditing(setPostcardText(drawnToEdit(), '信')));
    const dispatch = swipeToTuck(back, 650, 480).state;
    // 输入态往返
    const input = beginDispatchSend(dispatch);
    expect(input.phase).toBe('dispatch-send');
    expect(cancelDispatchSend(input).phase).toBe('dispatch');
    // 抉择取消：回展示位，文字保留
    const returned = cancelDispatch(dispatch);
    expect(returned.phase).toBe('back');
    expect(returned.text).toBe('信');
    // 抉择期间主场景手势隔离（dispatch 与 dispatch-send）
    for (const frozen of [dispatch, input]) {
      expect(beginDraw(frozen, 9, 100, 0)).toBe(frozen);
      expect(beginEditing(frozen)).toBe(frozen);
      expect(beginTuck(frozen, 9, 100, 0)).toBe(frozen);
    }
  });

  it('跳过统计的直落复位同样保留原文', () => {
    const back = toBack(finishEditing(setPostcardText(drawnToEdit(), '保留的字')));
    const dispatch = swipeToTuck(back, 650, 480, 200, 800, false).state;
    expect(dispatch.phase).toBe('dispatch');
    const idle = advanceUntil(beginDispatchLocalTuck(dispatch), 'idle');
    expect(idle.state.phase).toBe('idle');
    expect(idle.state.text).toBe('保留的字');
  });

  it('抽取位移保留为展开起点，抽出成功只发一次 drawn', () => {
    const release = endDraw(movePointer(beginDraw(createLetterState(), 1, 700, 0), 1, 600, 100), 1);
    expect(release.effects).toEqual(['drawn']);
    expect(endDraw(movePointer(beginDraw(createLetterState(), 1, 700, 0), 1, 690, 100), 1).effects).toEqual([]);
    expect(release.state.phase).toBe('unfold');
    expect(release.state.offsetY).toBe(-85);
    const partial = advanceLetterState({ ...release.state, elapsedMs: UNFOLD_DURATION_MS - 50 }, 80).state;
    expect(partial.phase).toBe('edit');
    expect(partial.offsetY).toBe(0);
  });

  it('取消不落袋：回缩后停在展示位，文字保留且可再次进入编辑', () => {
    let state = setPostcardText(drawnToEdit(), '保留的心事');
    state = finishEditing(state);
    state = advanceUntil(state, 'back').state;
    expect(state.phase).toBe('back');
    expect(state.text).toBe('保留的心事');
    expect(beginEditing(state).phase).toBe('edit');
  });

  it('空白信纸上滑收好同样保存', () => {
    const back = toBack(finishEditing(drawnToEdit()));
    const settled = advanceUntil(beginDispatchLocalTuck(swipeToTuck(back, 650, 480, 200, 800, false).state), 'idle');
    expect(settled.effects).toContain('save');
    expect(settled.effects).toContain('reset');
    expect(settled.state.phase).toBe('idle');
  });

  it('不满足统计节奏时收好完成后直接复位，无统计相位', () => {
    const back = toBack(finishEditing(setPostcardText(drawnToEdit(), '内容')));
    const done = advanceUntil(beginDispatchLocalTuck(swipeToTuck(back, 650, 480, 200, 800, false).state), 'idle');
    expect(done.effects).toContain('save');
    expect(done.effects).toContain('reset');
    expect(done.effects).not.toContain('afterglow');
  });

  it('上滑达屏高 15% 或速度超 700px/s：有内容进抉择，空白信直接收好', () => {
    const written = toBack(finishEditing(setPostcardText(drawnToEdit(), '有话要说')));
    expect(swipeToTuck(written, 650, 480, 500, 800, false).state.phase).toBe('dispatch');
    expect(swipeToTuck(written, 650, 520, 100, 800, false).state.phase).toBe('dispatch');
    // 空白信不弹抉择，直接折回收好
    const blank = toBack(finishEditing(drawnToEdit()));
    expect(swipeToTuck(blank, 650, 480, 500, 800, false).state.phase).toBe('settle');
  });

  it('未达阈值 300ms 回弹展示位，文字不丢失；拖拽跟手 0.85 阻尼', () => {
    const back = toBack(finishEditing(setPostcardText(drawnToEdit(), '保留')));
    const dragged = movePointer(beginTuck(back, 3, 600, 0), 3, 500, 100);
    expect(dragged.phase).toBe('drag');
    expect(dragged.offsetY).toBeCloseTo(-85, 5);
    // 慢速小幅上滑（80px / 400ms = 200px/s，均未达阈值）→ 回弹
    const slow = movePointer(beginTuck(back, 3, 600, 0), 3, 520, 400);
    const rebound = endTuck(slow, 3, 520, 400, 800, false);
    expect(rebound.state.phase).toBe('rebound');
    const settledBack = advanceUntil(rebound.state, 'back');
    expect(settledBack.state.phase).toBe('back');
    expect(settledBack.state.text).toBe('保留');
    expect(REBOUND_DURATION_MS).toBe(300);
  });

  it('quiet 结束时计数缺失则跳过统计直接复位（离线降级）', () => {
    const back = toBack(finishEditing(setPostcardText(drawnToEdit(), '内容')));
    const state = advanceUntil(beginDispatchLocalTuck(swipeToTuck(back, 650, 480).state), 'quiet').state;
    const done = advanceUntil(resolveCount(state, null), 'idle');
    expect(done.state.phase).toBe('idle');
    expect(done.effects).toContain('reset');
  });

  it('收好期间触摸无效，后台大步长只推进 100ms', () => {
    const settling: LetterState = { ...createLetterState(), phase: 'settle' };
    expect(beginDraw(settling, 2, 100, 0)).toBe(settling);
    expect(beginEditing(settling)).toBe(settling);
    const advanced = advanceLetterState(settling, 10_000).state;
    expect(advanced.phase).toBe('settle');
    expect(advanced.elapsedMs).toBe(MAX_FRAME_DELTA_MS);
  });

  it('跨相位保留剩余毫秒：edit-return 完成的同帧剩余量推进下一相位', () => {
    const returning = finishEditing(setPostcardText(drawnToEdit(), '字'));
    const nearEnd: LetterState = { ...returning, elapsedMs: 320 - 50 };
    const crossed = advanceLetterState(nearEnd, 80);
    expect(crossed.state.phase).toBe('back');
  });

  it('减弱动态效果时展开与收好均缩短为 150ms', () => {
    const released = endDraw(movePointer(beginDraw(createLetterState(), 1, 700, 0), 1, 600, 100), 1).state;
    let state = advanceLetterState(released, 100, true).state;
    expect(state.phase).toBe('unfold');
    state = advanceLetterState(state, REDUCED_UNFOLD_DURATION_MS - 100, true).state;
    expect(state.phase).toBe('edit');
    const back = advanceUntil(finishEditing(state), 'back', true).state;
    const settling = advanceUntil(beginDispatchLocalTuck(swipeToTuck(back, 650, 480, 200, 800, false).state), 'idle', true).state;
    expect(settling.phase).toBe('idle');
  });

  it('编辑态保留换行并按 Unicode 码点截断到 400 字', () => {
    expect(MAX_LETTER_TEXT_LENGTH).toBe(400);
    const back: LetterState = { ...createLetterState(), phase: 'back' };
    const editing = beginEditing(back);
    const source = `${'字'.repeat(MAX_LETTER_TEXT_LENGTH - 2)}\n${'字'.repeat(10)}😀末尾`;
    const written = setPostcardText(editing, source);
    expect(written.phase).toBe('edit');
    expect(Array.from(written.text)).toHaveLength(MAX_LETTER_TEXT_LENGTH);
    expect(written.text.includes('\n')).toBe(true);
    expect(advanceUntil(finishEditing(written), 'back').state.phase).toBe('back');
  });
});
