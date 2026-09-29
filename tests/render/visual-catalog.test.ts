import { describe, expect, it } from 'vitest';
import { createBurningState } from '../../src/core/letter/burning-state';
import { POSTCARD_CATALOG } from '../../src/core/letter/postcard-catalog';
import { APPEARANCES } from '../../src/core/meta/postcard-progress';
import { createBurnGeometryBuffer } from '../../src/core/render/burn-geometry';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { paintLetterScene } from '../../src/core/render/letter-painter';

function contextStub(draws: unknown[][]): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  return new Proxy({}, { get(_target, property) { if (property === 'drawImage') return (...args: unknown[]) => draws.push(args); if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient; if (property === 'measureText') return () => ({ width: 20 }); return () => undefined; }, set: () => true }) as unknown as CanvasRenderingContext2D;
}

describe('真实位图目录与双槽外观组合', () => {
  it('每个真实明信片素材 × 4 信封 × 4 纸纹均只用位图完成一帧绘制', () => {
    const envelopes = APPEARANCES.filter((item) => item.kind === 'envelope'); const papers = APPEARANCES.filter((item) => item.kind === 'paper');
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }); let combinations = 0;
    const openEnvelope = { id: 'open-envelope' } as unknown as CanvasImageSource;
    const letterPaper = { id: 'letter-paper' } as unknown as CanvasImageSource;
    for (const postcard of POSTCARD_CATALOG) for (const envelope of envelopes) for (const paper of papers) {
      const draws: unknown[][] = [];
      paintLetterScene(contextStub(draws), { width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'front' }, prompt: '想说的是……', envelopeAppearanceId: envelope.id, paperAppearanceId: paper.id, burnGeometry: createBurnGeometryBuffer(), burnSeed: postcard.burnSeed, menuGlowProgress: 0, assets: { openEnvelope, letterPaper } });
      expect(draws.some((args) => args[0] === openEnvelope)).toBe(true);
      expect(draws.some((args) => args[0] === letterPaper)).toBe(true);
      combinations += 1;
    }
    expect(combinations).toBe(16);
  });
});
