import { describe, expect, it } from 'vitest';
import { createEmptyLetterBurningState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { paintAppOverlay } from '../../src/core/render/app-overlay-painter';

interface RecordedFillText { text: string; x: number; y: number; maxWidth?: number; font: string }

/** 记录型上下文：捕获逐次 fillText（含当时 font）与位图绘制；measureText 按字符数×20 给定宽，换行可预测。 */
function createRecordingContext() {
  const fillTexts: RecordedFillText[] = [];
  const imageDraws: unknown[][] = [];
  const fontState = { font: '' };
  const gradient = { addColorStop() {} };
  const context = new Proxy({} as Record<string, unknown>, {
    get(_target, property) {
      if (property === 'fillText') {
        return (text: string, x: number, y: number, maxWidth?: number) => {
          fillTexts.push({ text, x, y, maxWidth, font: fontState.font });
        };
      }
      if (property === 'drawImage') return (...args: unknown[]) => imageDraws.push(args);
      if (property === 'measureText') return (text: string) => ({ width: Array.from(text).length * 20 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'font') return fontState.font;
      return () => undefined;
    },
    set(_target, property, value) {
      if (property === 'font') fontState.font = String(value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, fillTexts, imageDraws };
}

const VIEWPORT = { width: 402, height: 874, safeArea: { top: 62, bottom: 34, left: 0, right: 0 } } as const;

describe('手帐详情放大信纸阅览', () => {
  it('长文详情逐行绘制在书写区内，不整段压扁成单行', () => {
    const bodyText = `${'前'.repeat(60)}\n${'后'.repeat(60)}`;
    const state = settleCompletedPostcard(createEmptyLetterBurningState(), {
      id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: bodyText,
    });
    const recording = createRecordingContext();
    const letterPaper = { id: 'paper' } as unknown as CanvasImageSource;
    paintAppOverlay(recording.context, {
      ...VIEWPORT, page: 'journal', state, journalScroll: 0, selectedEntryIndex: 0, letterPaper,
    });

    // 正文用手写字体逐行绘制（每行至多约 12 字，绝无整段单行压缩）
    const bodyLines = recording.fillTexts.filter((item) => item.font.includes('Letter'));
    expect(bodyLines.length).toBeGreaterThanOrEqual(10);
    for (const line of bodyLines) {
      expect(Array.from(line.text).length).toBeLessThanOrEqual(13);
      expect(line.y).toBeGreaterThan(VIEWPORT.safeArea.top + 100);
      expect(line.y).toBeLessThan(VIEWPORT.height - VIEWPORT.safeArea.bottom);
    }
    expect(bodyLines.map((line) => line.text).join('')).toBe(bodyText.replace('\n', ''));

    // 日期小字仍在纸面上方，纸面位图确实绘制
    expect(recording.fillTexts.some((item) => item.text === '2026-09-28' && !item.font.includes('Letter'))).toBe(true);
    expect(recording.imageDraws.some((args) => args[0] === letterPaper)).toBe(true);
  });

  it('空记录详情只显示放大的信纸与日期，不绘制正文', () => {
    const state = settleCompletedPostcard(createEmptyLetterBurningState(), {
      id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: 'postcard-01', text: '',
    });
    const recording = createRecordingContext();
    const letterPaper = { id: 'paper' } as unknown as CanvasImageSource;
    paintAppOverlay(recording.context, {
      ...VIEWPORT, page: 'journal', state, journalScroll: 0, selectedEntryIndex: 0, letterPaper,
    });
    expect(recording.fillTexts.some((item) => item.font.includes('Letter'))).toBe(false);
    expect(recording.fillTexts.some((item) => item.text === '2026-09-28')).toBe(true);
    expect(recording.imageDraws.some((args) => args[0] === letterPaper)).toBe(true);
  });
});
