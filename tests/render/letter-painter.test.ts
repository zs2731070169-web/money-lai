import { describe, expect, it } from 'vitest';
import { createLetterState } from '../../src/core/letter/letter-state';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';
import { computeExpandedPaperRect, paintLetterScene, paintPaperWriting } from '../../src/core/render/letter-painter';

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
  let saveCount = 0; let restoreCount = 0;
  let currentPath: Array<[number, number]> = [];
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'strokeStyle') return strokeStyle;
      if (property === 'font') return font;
      if (property === 'globalAlpha') return globalAlpha;
      if (property === 'globalCompositeOperation') return globalCompositeOperation;
      if (property === 'save') return () => { saveCount += 1; };
      if (property === 'restore') return () => { restoreCount += 1; globalCompositeOperation = 'source-over'; compositeModes.push('source-over'); };
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
  return { context, strokes, fillRects, fillTexts, clippedPaths, compositeModes, get saveBalance() { return { saveCount, restoreCount }; } };
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

describe('倾诉画师', () => {
  it('书写排版自包含：multiply 与 clip 用 save/restore 包裹，不泄漏给调用方', () => {
    const recording = recordingContext();
    paintPaperWriting(recording.context, { left: 20, top: 30, width: 200, height: 300 }, '一段正文');
    expect(recording.compositeModes).toEqual(['multiply', 'source-over']);
    expect(recording.saveBalance).toEqual({ saveCount: 1, restoreCount: 1 });
  });

  it('长正文只在信纸书写区绘制可见部分，避免流出纸边', () => {
    const recording = recordingContext();
    const rect = { left: 20, top: 30, width: 200, height: 300 };
    paintPaperWriting(recording.context, rect, '这是一段很长的正文。'.repeat(45));
    expect(recording.clippedPaths).toContainEqual([
      [52, 72], [188, 72], [188, 288], [52, 288],
    ]);
    expect(recording.fillTexts.length).toBeGreaterThan(10);
    expect(Number.parseFloat(recording.fillTexts[0].font)).toBeGreaterThanOrEqual(9);
  });

  it('收好折回过程不出现任何火焰或余光绘制', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createLetterState(), phase: 'settle', elapsedMs: 225, text: '心事' },
      menuGlowProgress: 0,
      assets: { openEnvelopeBack: { id: 'back' } as unknown as CanvasImageSource, openEnvelopeFront: { id: 'front' } as unknown as CanvasImageSource, letterPaper: { id: 'paper' } as unknown as CanvasImageSource },
    });
    // 无火焰描边（画师仅有的 stroke 是菜单图标），无暖色径向余光填充
    expect(recording.strokes.length).toBeLessThanOrEqual(3);
  });

  it('下压放回到最大倾角时，折纸绘制被裁剪在信封底线以内', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    // “放回”手势：offsetY 钳回 0，单帧大位移让倾角直接到 8°，纸角原本会绕折线荡出信封底线
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: { ...createLetterState(), phase: 'draw', tiltDegrees: 8 },
      menuGlowProgress: 0,
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
      width: 402, height: 874, layout, state: createLetterState(),
      menuGlowProgress: 0,
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
    const paintPaper = (state: ReturnType<typeof createLetterState>) => {
      const recording = imageRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout, state,
        menuGlowProgress: 0,
        assets: { background: asset('background'), openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      return recording.draws.filter((draw) => draw.id === 'paper');
    };
    const idle = paintPaper(createLetterState());
    const draw = paintPaper({ ...createLetterState(), phase: 'draw', offsetY: -36 });
    const extracting = paintPaper({ ...createLetterState(), phase: 'unfold', offsetY: -72, elapsedMs: 100 });
    const settling = paintPaper({ ...createLetterState(), phase: 'unfold', offsetY: -72, elapsedMs: 225 });
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

  it('入袋后的安静与统计阶段呈现收好静置：信封 + 对折纸就位', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    for (const phase of ['quiet', 'stat'] as const) {
      const recording = imageRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout,
        state: { ...createLetterState(), phase, count: phase === 'stat' ? 7 : null },
        menuGlowProgress: 0,
        assets: { openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      // 与静置一致的三层：后层 → 对折纸 → 完全遮盖的前袋
      expect(recording.draws.map((draw) => draw.id), phase).toEqual(['back', 'paper', 'front']);
      expect(recording.draws[1].args.slice(4)).toEqual([
        layout.foldedCardRect.left, layout.foldedCardRect.top,
        layout.foldedCardRect.width, layout.foldedCardRect.height,
      ]);
    }
  });

  it('收好折回从展示位插回对折位，前袋随进度渐进遮回', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    const paintAt = (elapsedMs: number) => {
      const recording = imageRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout,
        state: { ...createLetterState(), phase: 'settle', elapsedMs, text: '收好' },
        menuGlowProgress: 0,
        assets: { openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      return recording.draws;
    };
    const early = paintAt(50);
    expect(early.map((draw) => draw.id)).toEqual(['back', 'paper']);
    const paperEarly = early.find((draw) => draw.id === 'paper');
    expect(paperEarly?.args[7]).toBeGreaterThan(layout.foldedCardRect.height);
    const late = paintAt(450);
    expect(late.map((draw) => draw.id)).toEqual(['back', 'paper', 'front']);
    const paperLate = late.find((draw) => draw.id === 'paper');
    expect(paperLate?.args.slice(4)).toEqual([
      layout.foldedCardRect.left, layout.foldedCardRect.top,
      layout.foldedCardRect.width, layout.foldedCardRect.height,
    ]);
  });

  it('展示位信纸保留原纸面与字迹，无横线或纸面蒙层，并用手写字体自然换行', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    const paintPhase = (phase: 'back' | 'settle', text = '') => {
      const recording = recordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout,
        state: { ...createLetterState(), phase, text },
        menuGlowProgress: 0,
        assets: { background: asset('background'), openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      return recording;
    };
    const blank = paintPhase('back');
    const writtenText = '这是用户写下的一句比较长的话，用于确认字迹会在原信纸上自然换行。';
    const back = paintPhase('back', writtenText);
    const english = paintPhase('back', 'handwritten test wraps naturally');

    expect(back.fillRects).toEqual(blank.fillRects);
    expect(back.strokes).toEqual(blank.strokes);
    expect(back.fillTexts.length).toBeGreaterThan(1);
    expect(back.fillTexts.map((item) => item.text).join('')).toBe(writtenText);
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
    // 空文字保持留白：缩小的信纸不再印引导语
    expect(blank.fillTexts).toHaveLength(0);
  });

  it('书写态使用所选字体套餐的中英文族名栈', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const recording = recordingContext();
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout,
      state: { ...createLetterState(), phase: 'back', text: '一封信 with all my heart' },
      fontPackageId: 'romantic-literary',
      menuGlowProgress: 0,
      assets: { openEnvelopeBack: { id: 'back' } as unknown as CanvasImageSource, openEnvelopeFront: { id: 'front' } as unknown as CanvasImageSource, letterPaper: { id: 'paper' } as unknown as CanvasImageSource },
    });
    expect(recording.fillTexts.some((line) => line.font.includes('Letter Cormorant Garamond'))).toBe(true);
    expect(recording.compositeModes).toContain('multiply');
  });

  it('全屏编辑态只放大同一张原信纸，回缩态先恢复后层再显现前袋', () => {
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    const expanded = computeExpandedPaperRect(layout);
    expect(expanded.width).toBeGreaterThan(layout.cardRect.width);
    expect(expanded.left).toBeGreaterThanOrEqual(layout.safeContentRect.left);
    const paint = (phase: 'edit' | 'edit-return', elapsedMs = 0) => {
      const recording = imageRecordingContext();
      paintLetterScene(recording.context, {
        width: 402, height: 874, layout,
        state: { ...createLetterState(), phase, elapsedMs, text: '第一行\n第二行' },
        menuGlowProgress: 0,
        assets: { background: asset('background'), openEnvelopeBack: asset('back'), openEnvelopeFront: asset('front'), letterPaper: asset('paper') },
      });
      return recording.draws;
    };
    const editingDraws = paint('edit', 320);
    expect(editingDraws.map((draw) => draw.id)).toEqual(['background', 'paper']);
    expect(editingDraws[1].args.slice(4)).toEqual([expanded.left, expanded.top, expanded.width, expanded.height]);
    const earlyReturningDraws = paint('edit-return', 80);
    expect(earlyReturningDraws.map((draw) => draw.id)).toEqual(['background', 'back', 'paper']);
    const returningDraws = paint('edit-return', 280);
    expect(returningDraws.map((draw) => draw.id)).toEqual(['background', 'back', 'paper', 'front']);
    expect(returningDraws[2].args[6]).toBeGreaterThan(layout.cardRect.width);
    expect(returningDraws[2].args[6]).toBeLessThan(expanded.width);
  });

  it('统计句显示在信封上方且分两行、数字放大', () => {
    const recording = recordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout,
      state: { ...createLetterState(), phase: 'stat', elapsedMs: 900, count: 7 },
      menuGlowProgress: 0,
      assets: { openEnvelopeBack: { id: 'back' } as unknown as CanvasImageSource, openEnvelopeFront: { id: 'front' } as unknown as CanvasImageSource, letterPaper: { id: 'paper' } as unknown as CanvasImageSource },
    });
    const statY = layout.envelopeRect.top - 24;
    const nowLine = recording.fillTexts.find((line) => line.text === '此刻');
    expect(nowLine?.y).toBe(statY - 22);
    const numberLine = recording.fillTexts.find((line) => line.text === '7');
    expect(numberLine?.font.startsWith('29px')).toBe(true);
    expect(numberLine?.y).toBe(statY + 17);
  });

  it('已合成背景整幅拉伸绘制且优先于原图 cover 裁切', () => {
    const recording = imageRecordingContext();
    const layout = computeLetterSceneLayout(402, 874, { top: 62, bottom: 34, left: 0, right: 0 });
    const asset = (id: string) => ({ id }) as unknown as CanvasImageSource;
    paintLetterScene(recording.context, {
      width: 402, height: 874, layout, state: createLetterState(),
      menuGlowProgress: 0,
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
