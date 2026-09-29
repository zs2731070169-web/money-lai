import { describe, expect, it } from 'vitest';
import { createEmptyLetterLetterState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { journalClearRect, paintAppOverlay } from '../../src/core/render/app-overlay-painter';

// 402×874、safeTop 62 → 页眉带 y∈[62,134)，页脚说明带 y>770
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };

describe('清空整本手帐入口（页眉带右上）', () => {
  it('入口矩形位于页眉带内且右缘贴安全区', () => {
    const rect = journalClearRect(402, SAFE_AREA);
    expect(rect.top).toBeGreaterThanOrEqual(SAFE_AREA.top);
    expect(rect.top + rect.height).toBeLessThan(SAFE_AREA.top + 72);
    expect(rect.left + rect.width).toBe(402);
  });

  it('入口文字绘制在页眉带纵带，页脚只保留本机说明', () => {
    const textDraws: Array<{ text: string; x: number; y: number }> = []; const gradient = { addColorStop() {} };
    const context = new Proxy({}, { get(_target, property) { if (property === 'fillText') return (text: string, x: number, y: number) => textDraws.push({ text, x, y }); if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient; if (property === 'measureText') return () => ({ width: 20 }); return () => undefined; }, set: () => true }) as unknown as CanvasRenderingContext2D;
    let state = createEmptyLetterLetterState();
    for (let index = 0; index < 4; index += 1) state = settleCompletedPostcard(state, { id: `entry-${index}`, createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '' });
    paintAppOverlay(context, { width: 402, height: 874, safeArea: SAFE_AREA, page: 'journal', state, journalScroll: 0, selectedEntryIndex: null });
    const clearDraws = textDraws.filter((draw) => draw.text === '清空整本手帐');
    expect(clearDraws.length).toBe(1);
    expect(clearDraws[0].y).toBeLessThan(SAFE_AREA.top + 72); // 页眉带内
    const noteDraws = textDraws.filter((draw) => draw.text === '这些东西只在这台设备上。');
    expect(noteDraws.length).toBe(1);
    expect(noteDraws[0].y).toBeGreaterThan(770); // 页脚说明仍在原位
  });
});
