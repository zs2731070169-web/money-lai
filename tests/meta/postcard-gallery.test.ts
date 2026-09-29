import { describe, expect, it } from 'vitest';
import { DEFAULT_POSTCARD_ID, POSTCARD_CATALOG } from '../../src/core/letter/postcard-catalog';
import { createEmptyLetterBurningState, settleCompletedPostcard } from '../../src/core/journal/journal-state';
import { paintAppOverlay } from '../../src/core/render/app-overlay-painter';

describe('独立明信片图鉴', () => {
  it('图鉴保留收藏功能，但只收集真实位图目录中的素材', () => {
    const state = settleCompletedPostcard(createEmptyLetterBurningState(), { id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: DEFAULT_POSTCARD_ID, text: '不进入图鉴' });
    expect(POSTCARD_CATALOG).toHaveLength(1);
    expect(state.collectedPatternIds).toEqual([DEFAULT_POSTCARD_ID]);
  });

  it('图鉴卡面只绘制 letter_paper 位图，不调用程序化图案图元', () => {
    const operations: string[] = []; const draws: unknown[] = []; const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
      get(_target, property) {
        if (property === 'drawImage') return (image: unknown) => draws.push(image);
        if (property === 'ellipse' || property === 'arc' || property === 'bezierCurveTo' || property === 'strokeRect') return () => operations.push(String(property));
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
        if (property === 'measureText') return () => ({ width: 20 });
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const letterPaper = { id: 'letter-paper' } as unknown as CanvasImageSource;
    const state = settleCompletedPostcard(createEmptyLetterBurningState(), { id: 'a', createdAtIso: '2026-09-28T00:00:00.000Z', patternId: DEFAULT_POSTCARD_ID, text: '' });
    paintAppOverlay(context, { width: 402, height: 874, safeArea: { top: 62, bottom: 34, left: 0, right: 0 }, page: 'gallery', state, journalScroll: 0, galleryScroll: 0, selectedEntryIndex: null, letterPaper });
    expect(draws).toContain(letterPaper);
    expect(operations).toEqual([]);
  });
});
