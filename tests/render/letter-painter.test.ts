import { describe, expect, it } from 'vitest';
import { createBurningState } from '../../src/core/letter/burning-state';
import { createBurnGeometryBuffer } from '../../src/core/render/burn-geometry';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { INNER_FLAME_COLOR, OUTER_FLAME_COLOR, computeExpandedPaperRect, paintLetterScene } from '../../src/core/render/letter-painter';

function recordingContext() {
  const strokes: string[] = [];
  const fillRects: Array<[number, number, number, number]> = [];
  const fillTexts: Array<{ text: string; x: number; y: number; maxWidth?: number; font: string; alpha: number }> = [];
  const clippedPaths: Array<Array<[number, number]>> = [];
  const gradients = { addColorStop() {} };
  let strokeStyle: string | CanvasGradient | CanvasPattern = '';
  let font = '';
  let globalAlpha = 1;
  let globalCompositeOperation = 'source-over';
  const compositeModes: string[] = [];
  let currentPath: Array<[number, number]> = [];
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'strokeStyle') return strokeStyle;
      if (property === 'font') return font;
      if (property === 'globalAlpha') return globalAlpha;
      if (property === 'globalCompositeOperation') return globalCompositeOperation;
      if (property === 'stroke') return () => strokes.push(String(strokeStyle));
      if (property === 'fillRect') return (x: number, y: number, width: number, height: number) => fillRects.push([x, y, width, height]);
      if (property === 'fillText') return (value: string, x: number, y: number, maxWidth?: number) => fillTexts.push({ text: value, x, y, maxWidth, font, alpha: globalAlpha });
      if (property === 'beginPath') return () => { currentPath = []; };
      if (property === 'moveTo' || property === 'lineTo') return (x: number, y: number) => currentPath.push([x, y]);
      if (property === 'rect') return (x: number, y: number, width: number, height: number) => currentPath.push([x, y], [x + width, y], [x + width, y + height], [x, y + height]);
      if (property === 'clip') return () => clippedPaths.push([...currentPath]);
      if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradients;
      return () => undefined;
    },
    set(target, property, value) {
      if (property === 'strokeStyle') strokeStyle = value as string;
      if (property === 'font') font = value as string;
      if (property === 'globalAlpha') globalAlpha = value as number;
      if (property === 'globalCompositeOperation') {
        globalCompositeOperation = value as string;
        compositeModes.push(globalCompositeOperation);
      }
      return Reflect.set(target as object, property, value);
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, strokes, fillRects, fillTexts, clippedPaths, compositeModes };
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
    envelopeAppearanceId: 'envelope-kraft', paperAppearanceId: 'paper-plain',
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

  it('下压放回到最大倾角时，折纸绘制被裁剪在信封底线以内', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    // “放回”手势：offsetY 钳回 0，单帧大位移让倾角直接到 8°，纸角原本会绕折线荡出信封底线
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'draw', tiltDegrees: 8 },
      prompt: '想说的是……',
      ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
    });
    const envelopeBottom = layout.envelopeRect.top + layout.envelopeRect.height;
    // 护栏裁剪：全宽矩形，底边落在信封底线内侧 1px（且不低于底线 2px），纸角被挡在信封内
    const guardClip = recording.clippedPaths.find((path) => {
      const ys = path.map(([, y]) => y);
      const xs = path.map(([x]) => x);
      const maxY = Math.max(...ys);
      return Math.min(...ys) === 0 && Math.min(...xs) <= 0 && maxY <= envelopeBottom - 1 && maxY >= envelopeBottom - 2;
    });
    expect(guardClip).toBeDefined();
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
        openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper'),
      },
    });

    expect(recording.draws.map((draw) => draw.id)).toEqual(['background', 'back', 'paper', 'front']);
    expect(recording.draws[1].args).toEqual(recording.draws[3].args);
    expect(recording.draws[2].args.slice(0, 4)).toEqual([56, 51, 917, 1409 / 2]);
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
        assets: { background: asset('background'), openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      return recording.draws.filter((draw) => draw.id === 'paper');
    };
    const idle = paintPaper(createBurningState());
    const draw = paintPaper({ ...createBurningState(), phase: 'draw', offsetY: -36 });
    const extracting = paintPaper({ ...createBurningState(), phase: 'unfold', offsetY: -72, elapsedMs: 100 });
    const settling = paintPaper({ ...createBurningState(), phase: 'unfold', offsetY: -72, elapsedMs: 225 });
    expect(idle).toHaveLength(1); expect(draw).toHaveLength(1); expect(extracting).toHaveLength(1); expect(settling).toHaveLength(2);
    for (const call of [idle[0], draw[0], extracting[0], settling[0]]) expect(call.args.slice(0, 4)).toEqual([56, 51, 917, 1409 / 2]);
    expect(draw[0].args.slice(6)).toEqual([layout.foldedCardRect.width, layout.foldedCardRect.height]);
    expect(draw[0].args[5]).toBe(layout.foldedCardRect.top - 36);
    expect(extracting[0].args[5]).toBeLessThan(layout.foldedCardRect.top - 72);
    expect(extracting[0].args[5]).toBeGreaterThan(layout.cardRect.top);
    expect(settling[0].args[5]).toBe(layout.cardRect.top);
    expect(settling[1].args.slice(0, 4)).toEqual([56, 51 + 1409 / 2, 917, 1409 / 2]);
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
      assets: { openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
    });
    const paper = recording.draws.find((draw) => draw.id === 'paper');
    expect(paper?.args.slice(0, 4)).toEqual([56, 51, 917, 1409]);
    expect(paper?.args.slice(4)).toEqual([layout.cardRect.left, layout.cardRect.top, layout.cardRect.width, layout.cardRect.height]);
    expect(recording.draws.map((draw) => draw.id)).toEqual(['back', 'paper', 'front']);
  });

  it('活动阶段按后层、信纸、前袋的固定顺序绘制真实位图', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    for (const phase of ['front', 'back', 'drag', 'rebound', 'burn'] as const) {
      const recording = imageRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout, state: { ...createBurningState(), phase }, prompt: '想说的是……',
        ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
        assets: { openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      expect(recording.draws.map((draw) => draw.id), phase).toEqual(['back', 'paper', 'front']);
    }
  });

  it('点按进入书写态仍保留原信纸，无横线或纸面蒙层，并用手写字体自然换行', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    const paintPhase = (phase: 'front' | 'back' | 'burn', text = '') => {
      const recording = recordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout,
        state: { ...createBurningState(), phase, text },
        prompt: '其实一直没说的是……',
        ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
        assets: { background: asset('background'), openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      return recording;
    };
    const front = paintPhase('front');
    const writtenText = '这是用户写下的一句比较长的话，用于确认字迹会在原信纸上自然换行。';
    const back = paintPhase('back', writtenText);
    const burning = paintPhase('burn', writtenText);
    const english = paintPhase('back', 'handwritten test wraps naturally');

    expect(back.fillRects).toEqual(front.fillRects);
    expect(back.strokes).toEqual(front.strokes);
    expect(back.fillTexts.length).toBeGreaterThan(1);
    expect(back.fillTexts.map((item) => item.text).join('')).toBe(writtenText);
    expect(burning.fillTexts.map((item) => item.text).join('')).toBe(writtenText);
    expect(english.fillTexts.map((item) => item.text)).toEqual(['handwritten test', 'wraps naturally']);
    expect(back.compositeModes).toContain('multiply');
    for (const line of back.fillTexts) {
      expect(line.font).toContain('Letter LXGW WenKai');
      expect(Number.parseFloat(line.font)).toBeLessThanOrEqual(13);
      expect(line.alpha).toBe(0.94);
      expect(line.x).toBeGreaterThan(layout.cardRect.left);
      expect(line.y).toBeGreaterThan(layout.cardRect.top);
      expect(line.y).toBeLessThan(layout.cardRect.top + layout.cardRect.height);
    }
    const prompt = paintPhase('back');
    expect(prompt.fillTexts).toHaveLength(1);
    expect(Number.parseFloat(prompt.fillTexts[0].font)).toBeGreaterThan(Number.parseFloat(back.fillTexts[0].font));
    expect(prompt.fillTexts[0].alpha).toBe(0.52);
  });

  it('书写态使用所选字体套餐的中英文族名栈', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const recording = recordingContext();
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout,
      state: { ...createBurningState(), phase: 'back', text: '一封信 with all my heart' },
      prompt: '其实一直没说的是……', ...visualOptions, fontPackageId: 'romantic-literary',
      burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
      assets: { openEnvelopeBack: { id: 'back' } as unknown as CanvasImageSource, openEnvelopeFront: { id: 'front' } as unknown as CanvasImageSource, letterPaper: { id: 'paper' } as unknown as CanvasImageSource },
    });
    expect(recording.fillTexts.some((line) => line.font.includes('Letter Cormorant Garamond'))).toBe(true);
    expect(recording.compositeModes).toContain('multiply');
  });

  it('全屏编辑态只放大同一张原信纸，回缩态从大纸面过渡回卡片', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    const expanded = computeExpandedPaperRect(layout);
    expect(expanded.width).toBeGreaterThan(layout.cardRect.width);
    expect(expanded.left).toBeGreaterThanOrEqual(layout.safeContentRect.left);
    const paint = (phase: 'edit' | 'edit-return', elapsedMs = 0) => {
      const recording = imageRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout,
        state: { ...createBurningState(), phase, elapsedMs, text: '第一行\n第二行' },
        prompt: '想说的是……', ...visualOptions, burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
        assets: { background: asset('background'), openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      return recording.draws;
    };
    const editingDraws = paint('edit', 320);
    expect(editingDraws.map((draw) => draw.id)).toEqual(['background', 'paper']);
    expect(editingDraws[1].args.slice(4)).toEqual([expanded.left, expanded.top, expanded.width, expanded.height]);
    const returningDraws = paint('edit-return', 160);
    expect(returningDraws.map((draw) => draw.id)).toEqual(['background', 'back', 'paper', 'front']);
    expect(returningDraws[2].args[6]).toBeGreaterThan(layout.cardRect.width);
    expect(returningDraws[2].args[6]).toBeLessThan(expanded.width);
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
