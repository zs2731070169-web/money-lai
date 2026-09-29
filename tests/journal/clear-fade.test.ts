import { describe, expect, it } from 'vitest';
import {
  createEmptyLetterLetterState, settleCompletedPostcard,
} from '../../src/core/journal/journal-state';
import { paintAppOverlay } from '../../src/core/render/app-overlay-painter';

// 402×874、safeTop 62；4 条记录的基础页面（日期文案随在途格式演进，断言只锚日期前缀）
const VIEWPORT = { width: 402, height: 874, safeArea: { top: 62, bottom: 34, left: 0, right: 0 } };

function journalStateWithEntries(entryCount: number) {
  let state = createEmptyLetterLetterState();
  for (let index = 0; index < entryCount; index += 1) {
    state = settleCompletedPostcard(state, { id: `entry-${index}`, createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '' });
  }
  return state;
}

/** 记录全部 fillText 文案的画布桩。 */
function textRecordingContext() {
  const texts: string[] = []; const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'fillText') return (text: string) => texts.push(text);
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 20 });
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { context, texts };
}

describe('清空 = 网格小图各自隐退，背景零变化', () => {
  it('journalGridFade=1：缩略图与日期全部不绘制，页面家具照常', () => {
    const { context, texts } = textRecordingContext();
    paintAppOverlay(context, {
      ...VIEWPORT, page: 'journal', state: journalStateWithEntries(4), journalScroll: 0,
      selectedEntryIndex: null, journalGridFade: 1,
    });
    expect(texts.some((text) => text.startsWith('2026-09-28'))).toBe(false); // 网格日期随小图一起隐没
    expect(texts).toContain('手帐'); // 标题不动
    expect(texts).toContain('‹ 返回'); // 左上返回不动
    expect(texts).toContain('清空手帐'); // 右上入口不动
  });

  it('journalGridFade 缺省（0）：网格照常绘制日期', () => {
    const { context, texts } = textRecordingContext();
    paintAppOverlay(context, {
      ...VIEWPORT, page: 'journal', state: journalStateWithEntries(4), journalScroll: 0, selectedEntryIndex: null,
    });
    expect(texts.some((text) => text.startsWith('2026-09-28'))).toBe(true);
  });
});
