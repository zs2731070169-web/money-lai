import { describe, expect, it } from 'vitest';
import { createLetterState } from '../../src/core/letter/letter-state';
import { POSTCARD_CATALOG } from '../../src/core/letter/postcard-catalog';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { paintLetterScene } from '../../src/core/render/letter-painter';
import { LETTER_THEMES } from '../../src/core/render/letter-theme';

function contextStub(draws: unknown[][]): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  return new Proxy({}, { get(_target, property) { if (property === 'drawImage') return (...args: unknown[]) => draws.push(args); if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient; if (property === 'measureText') return () => ({ width: 20 }); return () => undefined; }, set: () => true }) as unknown as CanvasRenderingContext2D;
}

describe('真实位图目录与信的主题组合', () => {
  it('每个真实明信片素材 × 每套主题均只用位图完成一帧绘制', () => {
    const themes = LETTER_THEMES;
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }); let combinations = 0;
    const openEnvelope = { id: 'open-envelope' } as unknown as CanvasImageSource;
    const letterPaper = { id: 'letter-paper' } as unknown as CanvasImageSource;
    for (const _postcard of POSTCARD_CATALOG) for (const _theme of themes) {
      const draws: unknown[][] = [];
      paintLetterScene(contextStub(draws), { width: 402, height: 874, layout, state: { ...createLetterState(), phase: 'back' }, menuGlowProgress: 0, assets: { openEnvelope, letterPaper } });
      expect(draws.some((args) => args[0] === openEnvelope)).toBe(true);
      expect(draws.some((args) => args[0] === letterPaper)).toBe(true);
      combinations += 1;
    }
    expect(combinations).toBe(POSTCARD_CATALOG.length * LETTER_THEMES.length);
  });
});
