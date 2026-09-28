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

interface RecordedGradient {
  kind: 'linear' | 'radial';
  stops: string[];
  addColorStop(offset: number, color: string): void;
}

function materialRecordingContext() {
  const calls: string[] = [];
  let path: string[] = [];
  let fillStyle: string | CanvasGradient | CanvasPattern = '';
  let strokeStyle: string | CanvasGradient | CanvasPattern = '';
  let globalAlpha = 1;
  const number = (value: number) => value.toFixed(2);
  const styleKey = (style: string | CanvasGradient | CanvasPattern) => {
    if (typeof style === 'string') return style;
    const gradient = style as unknown as RecordedGradient;
    return `${gradient.kind}(${gradient.stops.join(',')})`;
  };
  const gradient = (kind: RecordedGradient['kind']): RecordedGradient => ({
    kind,
    stops: [],
    addColorStop(offset: number, color: string) { this.stops.push(`${offset}:${color}`); },
  });
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'fillStyle') return fillStyle;
      if (property === 'strokeStyle') return strokeStyle;
      if (property === 'globalAlpha') return globalAlpha;
      if (property === 'createLinearGradient') return () => gradient('linear');
      if (property === 'createRadialGradient') return () => gradient('radial');
      if (property === 'beginPath') return () => { path = []; };
      if (property === 'moveTo' || property === 'lineTo') return (x: number, y: number) => path.push(`${String(property)}:${number(x)},${number(y)}`);
      if (property === 'quadraticCurveTo') return (...values: number[]) => path.push(`quadratic:${values.map(number).join(',')}`);
      if (property === 'bezierCurveTo') return (...values: number[]) => path.push(`bezier:${values.map(number).join(',')}`);
      if (property === 'arc' || property === 'ellipse') return (...values: number[]) => path.push(`${String(property)}:${values.map(number).join(',')}`);
      if (property === 'closePath') return () => path.push('close');
      if (property === 'fill') return () => calls.push(`fill:${styleKey(fillStyle)}:${number(globalAlpha)}:${path.join('|')}`);
      if (property === 'stroke') return () => calls.push(`stroke:${styleKey(strokeStyle)}:${number(globalAlpha)}:${path.join('|')}`);
      if (property === 'fillRect') return (x: number, y: number, width: number, height: number) => calls.push(`fillRect:${styleKey(fillStyle)}:${number(globalAlpha)}:${[x, y, width, height].map(number).join(',')}`);
      if (property === 'strokeRect') return (x: number, y: number, width: number, height: number) => calls.push(`strokeRect:${styleKey(strokeStyle)}:${number(globalAlpha)}:${[x, y, width, height].map(number).join(',')}`);
      if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
      return () => undefined;
    },
    set(_target, property, value) {
      if (property === 'fillStyle') fillStyle = value as typeof fillStyle;
      if (property === 'strokeStyle') strokeStyle = value as typeof strokeStyle;
      if (property === 'globalAlpha') globalAlpha = value as number;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, calls };
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
  it('燃烧边界只使用规定外焰与内焰色', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'burn', elapsedMs: 1350 },
      patternId: 'postcard-01', prompt: '想说的是……', envelopeAppearanceId: 'envelope-kraft', paperAppearanceId: 'paper-plain',
      burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
    });
    expect(recording.strokes).toContain(OUTER_FLAME_COLOR);
    expect(recording.strokes).toContain(INNER_FLAME_COLOR);
  });

  it('未烧纸面遮罩先沿底边闭合，不形成自交蝴蝶结', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createBurningState(), phase: 'burn', elapsedMs: 1350 },
      patternId: 'postcard-01', prompt: '想说的是……', envelopeAppearanceId: 'envelope-kraft', paperAppearanceId: 'paper-plain',
      burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
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

  it('信封以稳定且有限的实体纸材命令包住露出的明信片', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const paint = () => {
      const recording = materialRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout, state: createBurningState(),
        patternId: 'postcard-01', prompt: '想说的是……', envelopeAppearanceId: 'envelope-kraft', paperAppearanceId: 'paper-plain',
        burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
      });
      return recording.calls;
    };

    const firstFrame = paint();
    const secondFrame = paint();
    expect(secondFrame).toEqual(firstFrame);
    expect(firstFrame.length).toBeGreaterThan(45);
    expect(firstFrame.length).toBeLessThan(240);

    const cardIndex = firstFrame.findIndex((call) => call.startsWith('fill:#EEE0CF'));
    expect(cardIndex).toBeGreaterThan(0);
    expect(firstFrame.slice(0, cardIndex).some((call) => call.includes('#C9A785'))).toBe(true);
    expect(firstFrame.slice(cardIndex + 1).some((call) => call.includes('#C9A785'))).toBe(true);

    const fullWidthRules = firstFrame.filter((call) => /stroke:.*moveTo:0\.00,([\d.]+)\|lineTo:402\.00,\1/.test(call));
    expect(fullWidthRules).toHaveLength(0);
  });

  it('本地位图按背景、信封后层、信纸、信封前袋的顺序绘制', () => {
    const recording = imageRecordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: createBurningState(),
      patternId: 'postcard-01', prompt: '想说的是……', envelopeAppearanceId: 'envelope-kraft', paperAppearanceId: 'paper-plain',
      burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
      assets: {
        background: asset('background'), closedEnvelope: asset('closed'),
        openEnvelope: asset('open'), letterPaper: asset('paper'),
      },
    });

    expect(recording.draws.map((draw) => draw.id)).toEqual(['background', 'open', 'paper', 'open']);
    expect(recording.draws[1].args).toEqual(recording.draws[3].args);
  });

  it('已合成背景整幅拉伸绘制且优先于原图 cover 裁切', () => {
    const recording = imageRecordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: createBurningState(),
      patternId: 'postcard-01', prompt: '想说的是……', envelopeAppearanceId: 'envelope-kraft', paperAppearanceId: 'paper-plain',
      burnGeometry: createBurnGeometryBuffer(), burnSeed: 8, menuGlowProgress: 0,
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
