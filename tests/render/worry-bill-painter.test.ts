import { describe, expect, it } from 'vitest';
import {
  WORRY_TEXT_MIN_VISIBILITY,
  WORRY_TEXT_MAX_VISIBILITY,
  paintGraspedBillStack,
  paintWorryBillFace,
} from '../../src/core/render/worry-bill-painter';
import { Rect } from '../../src/core/wallet/flap-hit-test';

/** 心事钞票面与指尖纸沓画师单测（worry-release 任务 3.1/3.2）。 */

const BILL_RECT: Rect = { left: 120, top: 600, width: 150, height: 75 };

/** 记录型 2D 上下文替身：捕获 fillText 与 globalAlpha */
function createRecordingContext() {
  const context = {
    globalAlpha: 1,
    fillStyle: '#000000',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    lineWidth: 1,
    strokeStyle: '',
    textCalls: [] as Array<{ text: string; globalAlpha: number }>,
    pathBounds: [] as Array<{ x: number; y: number }>,
    beginPath: () => {},
    moveTo: (x: number, y: number) => {
      context.pathBounds.push({ x, y });
    },
    lineTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    setLineDash: () => {},
    save: () => {},
    restore: () => {},
    translate: (x: number, y: number) => {
      context.pathBounds.push({ x, y });
    },
    rotate: () => {},
    measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics,
    fillText: (text: string) => {
      context.textCalls.push({ text, globalAlpha: context.globalAlpha });
    },
  };
  return context;
}

describe('心事钞票面', () => {
  it('堆顶淡字：可见度下限 WORRY_TEXT_MIN_VISIBILITY', () => {
    const context = createRecordingContext();
    paintWorryBillFace(context as unknown as CanvasRenderingContext2D, BILL_RECT, '周一汇报', 0);
    expect(context.textCalls).toHaveLength(1);
    expect(context.textCalls[0].text).toBe('周一汇报');
    expect(context.textCalls[0].globalAlpha).toBeCloseTo(WORRY_TEXT_MIN_VISIBILITY);
  });

  it('抽起清晰：可见度升至上限 1.0（传入更低值被钳在下限之上）', () => {
    const context = createRecordingContext();
    paintWorryBillFace(context as unknown as CanvasRenderingContext2D, BILL_RECT, '房贷', 1);
    expect(context.textCalls[0].globalAlpha).toBeCloseTo(WORRY_TEXT_MAX_VISIBILITY);
    const clampedContext = createRecordingContext();
    paintWorryBillFace(
      clampedContext as unknown as CanvasRenderingContext2D,
      BILL_RECT,
      '房贷',
      -0.5,
    );
    expect(clampedContext.textCalls[0].globalAlpha).toBeCloseTo(WORRY_TEXT_MIN_VISIBILITY);
  });

  it('超长文本按宽度截断（省略号收尾，不溢出票面）', () => {
    const context = createRecordingContext();
    paintWorryBillFace(
      context as unknown as CanvasRenderingContext2D,
      BILL_RECT,
      '这是一段非常长的心事文本用来验证截断行为',
      1,
    );
    expect(context.textCalls[0].text.endsWith('…')).toBe(true);
    expect(context.textCalls[0].text.length).toBeLessThan(15);
  });
});

describe('指尖纸沓', () => {
  it('五层错位堆叠：以中心+垂坠偏移为基准产生多层绘制', () => {
    const context = createRecordingContext();
    paintGraspedBillStack(context as unknown as CanvasRenderingContext2D, 200, 300, 80, 40, 6);
    // translate 5 次（每层一次），基准 y 含垂坠偏移
    const translateCalls = context.pathBounds.filter((point) => point.x === 200);
    expect(translateCalls.length).toBeGreaterThanOrEqual(5);
    expect(translateCalls.some((point) => point.y === 300 + 6)).toBe(true);
  });
});
