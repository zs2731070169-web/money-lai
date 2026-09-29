import { describe, expect, it } from 'vitest';
import { computeJournalLayout } from '../../src/core/journal/journal-layout';
import { advanceBurningState, finishEditing, setPostcardText, type BurningState } from '../../src/core/letter/burning-state';

describe('倾诉热路径性能冒烟', () => {
  it('完整收好链路（书写→确认→折回→安静→统计）按 100ms 帧推进且总帧数有界', () => {
    // 抽取展开后进入编辑（unfold 450ms / 5 帧）
    let state: BurningState = { phase: 'edit', text: '' } as BurningState;
    state = setPostcardText(state, '一句话');
    state = finishEditing(state, true, true);
    let frames = 0;
    while (state.phase !== 'idle' && frames < 100) {
      state = advanceBurningState(state, 100).state;
      frames += 1;
    }
    expect(state.phase).toBe('idle');
    // edit-return 320 + settle 450 + quiet 1500 + stat 3000 = 52.7s÷0.1 ≈ 53 帧上限
    expect(frames).toBeLessThanOrEqual(60);
  });

  it('500 条手帐滚动只布局可见行', () => {
    const layout = computeJournalLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }, 500, 8000);
    expect(layout.cells.length).toBeLessThan(40);
  });
});
