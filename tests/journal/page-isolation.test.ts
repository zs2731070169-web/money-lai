import { describe, expect, it } from 'vitest';
import { createEmptyLetterLetterState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { paintAppOverlay } from '../../src/core/render/app-overlay-painter';

describe('手帐页面数据隔离', () => {
  it('默认网格绘制图案、日期与本机说明，不绘制文字和元进程', () => {
    const texts: string[] = []; const gradient = { addColorStop() {} };
    const context = new Proxy({}, { get(_target, property) { if (property === 'fillText') return (text: string) => texts.push(text); if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient; if (property === 'measureText') return () => ({ width: 20 }); return () => undefined; }, set: () => true }) as unknown as CanvasRenderingContext2D;
    const state = settleCompletedPostcard(createEmptyLetterLetterState(), { id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '隐藏原文' });
    paintAppOverlay(context, { width: 402, height: 874, safeArea: { top: 62, bottom: 34, left: 0, right: 0 }, page: 'journal', state, journalScroll: 0, selectedEntryIndex: null });
    expect(texts).toContain('这些东西只在这台设备上。'); expect(texts).toContain('2026-09-28'); expect(texts).not.toContain('隐藏原文'); expect(texts).not.toContain(String(state.postcardMileage));
  });

  it('一级菜单只绘制七个功能行，不再绘制医疗声明、12355 与清空入口', () => {
    const texts: string[] = []; const gradient = { addColorStop() {} };
    const context = new Proxy({}, { get(_target, property) { if (property === 'fillText') return (text: string) => texts.push(text); if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient; if (property === 'measureText') return () => ({ width: 20 }); return () => undefined; }, set: () => true }) as unknown as CanvasRenderingContext2D;
    paintAppOverlay(context, { width: 402, height: 874, safeArea: { top: 62, bottom: 34, left: 0, right: 0 }, page: 'menu', state: createEmptyLetterLetterState(), journalScroll: 0, selectedEntryIndex: null });
    expect(texts).toEqual(['×', '心里话里程', '主题', '字体', '成就', '手帐', '隐私']);
  });

  it('手帐页绘制清空整本手帐入口', () => {
    const texts: string[] = []; const gradient = { addColorStop() {} };
    const context = new Proxy({}, { get(_target, property) { if (property === 'fillText') return (text: string) => texts.push(text); if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient; if (property === 'measureText') return () => ({ width: 20 }); return () => undefined; }, set: () => true }) as unknown as CanvasRenderingContext2D;
    paintAppOverlay(context, { width: 402, height: 874, safeArea: { top: 62, bottom: 34, left: 0, right: 0 }, page: 'journal', state: createEmptyLetterLetterState(), journalScroll: 0, selectedEntryIndex: null });
    expect(texts).toContain('清空整本手帐'); expect(texts).toContain('这些东西只在这台设备上。');
  });
});
