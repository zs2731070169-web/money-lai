import { describe, expect, it } from 'vitest';
import { createBurningState } from '../../src/core/letter/burning-state';
import { createBurnGeometryBuffer } from '../../src/core/render/burn-geometry';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { INNER_FLAME_COLOR, OUTER_FLAME_COLOR, paintLetterScene } from '../../src/core/render/letter-painter';

function recordingContext() {
  const strokes: string[] = [];
  const clippedPaths: Array<Array<[number, number]>> = [];
  const gradients = { addColorStop() {} };
  let strokeStyle: string | CanvasGradient | CanvasPattern = '';
  let currentPath: Array<[number, number]> = [];
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'strokeStyle') return strokeStyle;
      if (property === 'stroke') return () => strokes.push(String(strokeStyle));
      if (property === 'beginPath') return () => { currentPath = []; };
      if (property === 'moveTo' || property === 'lineTo') return (x: number, y: number) => currentPath.push([x, y]);
      if (property === 'clip') return () => clippedPaths.push([...currentPath]);
      if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradients;
      return () => undefined;
    },
    set(target, property, value) { if (property === 'strokeStyle') strokeStyle = value as string; return Reflect.set(target as object, property, value); },
  }) as unknown as CanvasRenderingContext2D;
  return { context, strokes, clippedPaths };
}

function imageRecordingContext() {
  const draws: Array<{ id: string; args: number[] }> = [];
  const gradients = { addColorStop() {} };
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'drawImage') return (image: { id?: string }, ...args: number[]) => draws.push({ id: image.id ?? 'unknown', args });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradients;
      if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { context, draws };
}

describe('燃信画师', () => {
  const visualOptions = {
    patternId: 'postcard-01', envelopeAppearanceId: 'envelope-kraft', paperAppearanceId: 'paper-plain',
  } as const;

  it('燃烧边界只使用规定外焰与内焰色', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'burn', elapsedMs: 1350 },
      prompt: '想说的是……',
      ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
    });
    expect(recording.strokes).toContain(OUTER_FLAME_COLOR);
    expect(recording.strokes).toContain(INNER_FLAME_COLOR);
  });

  it('未烧纸面遮罩先沿底边闭合，不形成自交蝴蝶结', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'burn', elapsedMs: 1350 },
      prompt: '想说的是……',
      ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
    });
    const bottom = layout.burnCardRect.top + layout.burnCardRect.height;
    const mask = recording.clippedPaths.find((path) => path[0]?.[1] === bottom && path[1]?.[1] === bottom);
    expect(mask).toBeDefined();
    if (!mask) return;
    expect(mask[0]).toEqual([layout.burnCardRect.left, bottom]);
    expect(mask[1]).toEqual([layout.burnCardRect.left + layout.burnCardRect.width, bottom]);
    expect(mask[2][0]).toBeCloseTo(layout.burnCardRect.left + layout.burnCardRect.width);
    expect(mask.at(-1)?.[0]).toBeCloseTo(layout.burnCardRect.left);
  });

  it('本地位图按背景、信封后层、信纸、信封前袋的顺序绘制', () => {
    const recording = imageRecordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: createBurningState(),
      prompt: '想说的是……',
      ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
      assets: {
        background: asset('background'), closedEnvelope: asset('closed'),
        openEnvelope: asset('open'), letterPaper: asset('paper'),
      },
    });

    expect(recording.draws.map((draw) => draw.id)).toEqual(['background', 'open', 'paper', 'open']);
    expect(recording.draws[1].args).toEqual(recording.draws[3].args);
    expect(recording.draws[2].args.slice(0, 4)).toEqual([13, 15, 491, 733 / 2]);
    expect(recording.draws[2].args.slice(4)).toEqual([
      layout.foldedCardRect.left, layout.foldedCardRect.top,
      layout.foldedCardRect.width, layout.foldedCardRect.height,
    ]);
  });

  it('静置与跟手保持同一张自然半页折纸，松手后才连续展开下半页', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    const paintPaper = (state: ReturnType<typeof createBurningState>) => {
      const recording = imageRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout, state, prompt: '想说的是……',
        ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
        assets: { background: asset('background'), openEnvelope: asset('open'), letterPaper: asset('paper') },
      });
      return recording.draws.filter((draw) => draw.id === 'paper');
    };
    const idle = paintPaper(createBurningState());
    const draw = paintPaper({ ...createBurningState(), phase: 'draw', offsetY: -36 });
    const extracting = paintPaper({ ...createBurningState(), phase: 'unfold', offsetY: -72, elapsedMs: 100 });
    const settling = paintPaper({ ...createBurningState(), phase: 'unfold', offsetY: -72, elapsedMs: 225 });
    expect(idle).toHaveLength(1); expect(draw).toHaveLength(1); expect(extracting).toHaveLength(1); expect(settling).toHaveLength(2);
    for (const call of [idle[0], draw[0], extracting[0], settling[0]]) expect(call.args.slice(0, 4)).toEqual([13, 15, 491, 733 / 2]);
    expect(draw[0].args.slice(6)).toEqual([layout.foldedCardRect.width, layout.foldedCardRect.height]);
    expect(draw[0].args[5]).toBe(layout.foldedCardRect.top - 36);
    expect(extracting[0].args[5]).toBeLessThan(layout.foldedCardRect.top - 72);
    expect(extracting[0].args[5]).toBeGreaterThan(layout.cardRect.top);
    expect(settling[0].args[5]).toBe(layout.cardRect.top);
    expect(settling[1].args.slice(0, 4)).toEqual([13, 15 + 733 / 2, 491, 733 / 2]);
    expect(settling[1].args[7]).toBeGreaterThan(0);
    expect(settling[1].args[7]).toBeLessThan(layout.cardRect.height / 2);
  });

  it('展开结束后的正面恢复完整竖版信纸采样与尺寸', () => {
    const recording = imageRecordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'front' }, prompt: '想说的是……',
      ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
      assets: { openEnvelope: asset('open'), letterPaper: asset('paper') },
    });
    const paper = recording.draws.find((draw) => draw.id === 'paper');
    expect(paper?.args.slice(0, 4)).toEqual([13, 15, 491, 733]);
    expect(paper?.args.slice(4)).toEqual([layout.cardRect.left, layout.cardRect.top, layout.cardRect.width, layout.cardRect.height]);
  });

  it('已合成背景整幅拉伸绘制且优先于原图 cover 裁切', () => {
    const recording = imageRecordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: createBurningState(),
      prompt: '想说的是……',
      ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
      assets: {
        background: asset('background'), backgroundComposed: asset('composed'),
        closedEnvelope: asset('closed'), openEnvelope: asset('open'), letterPaper: asset('paper'),
      },
    });

    // 第一笔就是合成背景的 5 参整幅拉伸，原图 cover 不再绘制
    expect(recording.draws[0]).toEqual({ id: 'composed', args: [0, 0, 402, 874] });
    expect(recording.draws.map((draw) => draw.id)).not.toContain('background');
  });
});
