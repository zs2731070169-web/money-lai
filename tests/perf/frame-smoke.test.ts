import { describe, expect, it } from 'vitest';
import { computeJournalLayout } from '../../src/core/journal/journal-layout';
import { advanceLetterState, beginDispatchLocalTuck, beginTuck, endTuck, finishEditing, movePointer, setPostcardText, type LetterState } from '../../src/core/letter/letter-state';

describe('倾诉热路径性能冒烟', () => {
  it('完整收好链路（书写→确认→展示位→上滑→折回→安静→统计）按 100ms 帧推进且总帧数有界', () => {
    // 抽取展开后进入编辑（unfold 450ms / 5 帧）
    let state: LetterState = { phase: 'edit', text: '' } as LetterState;
    state = setPostcardText(state, '一句话');
    state = finishEditing(state);
    // 确认只回展示位；上滑释放进入收好
    while (state.phase !== 'back') state = advanceLetterState(state, 100).state;
    state = endTuck(movePointer(beginTuck(state, 1, 650, 0), 1, 470, 200), 1, 470, 200, 800, true).state;
    // 上滑后先入寄送抉择，性能链路按「仅收好到本地」继续推进
    state = beginDispatchLocalTuck(state);
    let frames = 0;
    while (state.phase !== 'idle' && frames < 100) {
      state = advanceLetterState(state, 100).state;
      frames += 1;
    }
    expect(state.phase).toBe('idle');
    // settle 450 + quiet 1500 + stat 3000 = 4.95s÷0.1 ≈ 50 帧上限（抉择相位静止帧不计入动画帧）
    expect(frames).toBeLessThanOrEqual(55);
  });

  it('500 条手帐滚动只布局可见行', () => {
    const layout = computeJournalLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }, 500, 8000);
    expect(layout.cells.length).toBeLessThan(40);
  });
});
