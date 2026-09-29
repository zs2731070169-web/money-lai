import { describe, expect, it } from 'vitest';
import { createEmptyLetterLetterState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { hitJournalCell, paintAppOverlay } from '../../src/core/render/app-overlay-painter';

// 402×874、safeTop 62 → 页眉带为 y∈[62,134)；10 条记录、滚动 200 时第二行格块顶部约 96.97，跨入页眉带
const VIEWPORT = { width: 402, height: 874, safeArea: { top: 62, bottom: 34, left: 0, right: 0 } };

function journalStateWithEntries(entryCount: number) {
  let state = createEmptyLetterLetterState();
  for (let index = 0; index < entryCount; index += 1) {
    state = settleCompletedPostcard(state, { id: `entry-${index}`, createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '' });
  }
  return state;
}

describe('手帐网格与页眉带隔离', () => {
  it('页眉带内点按不命中被裁剪的格块，带下可见部分照常命中', () => {
    const hit = (x: number, y: number) => hitJournalCell(VIEWPORT.width, VIEWPORT.height, VIEWPORT.safeArea, 10, 200, x, y);
    expect(hit(40, 110)).toBeNull(); // 带内：格块被裁剪隐藏的部分不可点
    expect(hit(40, 200)).toBe(3); // 带下：同一格块可见部分照常命中
  });

  it('滚动中网格整体裁剪在页眉带之下（rect 紧随 clip）', () => {
    const operations: string[] = []; const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
      get(_target, property) {
        if (property === 'fillText') return () => undefined;
        if (property === 'rect') return (...args: number[]) => operations.push(`rect(${args.join(',')})`);
        if (property === 'clip') return () => operations.push('clip');
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
        if (property === 'measureText') return () => ({ width: 20 });
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    paintAppOverlay(context, { ...VIEWPORT, page: 'journal', state: journalStateWithEntries(10), journalScroll: 200, selectedEntryIndex: null });
    expect(operations.join('|')).toContain('rect(0,134,402,740)|clip');
  });
});
