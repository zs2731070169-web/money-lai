import { describe, expect, it } from 'vitest';
import { createBurningState } from '../../src/core/letter/burning-state';
import { POSTCARD_PATTERNS } from '../../src/core/letter/patterns';
import { APPEARANCES } from '../../src/core/meta/postcard-progress';
import { createBurnGeometryBuffer } from '../../src/core/render/burn-geometry';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { paintLetterScene } from '../../src/core/render/letter-painter';

function contextStub(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  return new Proxy({}, { get(_target, property) { if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient; if (property === 'measureText') return () => ({ width: 20 }); return () => undefined; }, set: () => true }) as unknown as CanvasRenderingContext2D;
}

describe('图案与双槽外观组合目录', () => {
  it('24 图案 × 4 信封 × 4 纸纹均可完成一帧绘制', () => {
    const envelopes = APPEARANCES.filter((item) => item.kind === 'envelope'); const papers = APPEARANCES.filter((item) => item.kind === 'paper');
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 }); let combinations = 0;
    for (const pattern of POSTCARD_PATTERNS) for (const envelope of envelopes) for (const paper of papers) {
      paintLetterScene(contextStub(), { width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'front' }, patternId: pattern.id, prompt: '想说的是……', envelopeAppearanceId: envelope.id, paperAppearanceId: paper.id, burnGeometry: createBurnGeometryBuffer(), burnSeed: pattern.seed, menuGlowProgress: 0 }); combinations += 1;
    }
    expect(combinations).toBe(384);
  });
});

