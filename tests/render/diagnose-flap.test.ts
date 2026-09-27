import { describe, expect, it } from 'vitest';
import { paintWalletScene } from '../../src/core/render/wallet-painter';
import { resolveWalletLeatherPalette } from '../../src/core/render/skin-palettes';
import { OffscreenCanvasSurface } from '../../src/core/platform';

/** 诊断：166° 直立稳态下背面条带的 drawImage 目标矩形是否在钱包顶边上方 */
function createRecordingContext() {
  const drawImageCalls: Array<{ dx: number; dy: number; dw: number; dh: number }> = [];
  const gradientStub = { addColorStop: () => {} };
  const context = {
    drawImage: (_src: unknown, _sx: number, _sy: number, _sw: number, _sh: number, dx: number, dy: number, dw: number, dh: number) => {
      drawImageCalls.push({ dx, dy, dw, dh });
    },
    createLinearGradient: () => gradientStub,
    save: () => {}, restore: () => {},
    translate: () => {}, scale: () => {}, rotate: () => {},
    beginPath: () => {},
    rect: () => {}, ellipse: () => {}, closePath: () => {}, moveTo: () => {}, lineTo() {},
    clip: () => {}, fill: () => {}, stroke: () => {}, quadraticCurveTo: () => {},
    fillRect: () => {}, arc: () => {},
    setLineDash: () => {},
    measureText: () => ({ width: 12 }),
    fillText: () => {},
  };
  return { context: context as unknown as CanvasRenderingContext2D, drawImageCalls };
}

function fakeSurface(): OffscreenCanvasSurface {
  return {
    renderingContext: {} as CanvasRenderingContext2D,
    sourceSurface: {} as CanvasImageSource,
    pixelWidth: 209,
    pixelHeight: 174,
  };
}

describe('诊断：直立稳态翻盖渲染', () => {
  it('θ=166° 时应有 drawImage 目标位于钱包顶边上方', () => {
    const { context, drawImageCalls } = createRecordingContext();
    paintWalletScene(context, {
      walletRect: { left: 97, top: 367, width: 209, height: 386 },
      foldLineY: 367 + 174,
      flapRotationDegrees: 166,
      breathingScale: 1,
      flapFaceSurfaces: { front: fakeSurface(), back: fakeSurface() },
      walletLeatherPalette: resolveWalletLeatherPalette(null),
    });
    const aboveHinge = drawImageCalls.filter((call) => call.dy < 367);
    console.log('[diag] drawImage 总数 =', drawImageCalls.length, '；顶边上方 =', aboveHinge.length);
    if (aboveHinge.length > 0) {
      console.log('[diag] 最高目标 y =', Math.min(...aboveHinge.map((c) => c.dy)), '（顶边=367）');
      console.log('[diag] 最大目标宽 =', Math.max(...aboveHinge.map((c) => c.dw)));
    }
    expect(aboveHinge.length).toBeGreaterThan(0);
  });
});
