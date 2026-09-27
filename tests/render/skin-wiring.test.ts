import { describe, expect, it } from 'vitest';
import { paintWalletScene, drawFlapFrontFaceArt } from '../../src/core/render/wallet-painter';
import { paintLaiBanknote } from '../../src/core/render/bill-painter';
import { resolveBillColors, resolveWalletLeatherPalette } from '../../src/core/render/skin-palettes';

/**
 * 皮肤色板画师接线（wire-skin-palettes）：
 * 切换皮肤后钱包/翻盖/票面必须按入参色板落笔，而非静态设计令牌。
 */

function createFillStyleRecordingContext() {
  const fillStyles: string[] = [];
  const gradientStub = { addColorStop() {} };
  const context = {
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
    beginPath() {}, rect() {}, ellipse() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {}, setLineDash() {},
    clip() {}, clearRect() {},
    createLinearGradient() { return gradientStub; },
    fillRect() {}, fillText() {},
    measureText: () => ({ width: 12 }),
    drawImage() {},
    set fillStyle(value: string) { fillStyles.push(value); },
    get fillStyle() { return fillStyles.at(-1) ?? ''; },
    set strokeStyle(_value: string) {},
    set globalAlpha(_value: number) {},
    set lineWidth(_value: number) {},
    set font(_value: string) {},
    set textAlign(_value: string) {},
    set textBaseline(_value: string) {},
  } as unknown as CanvasRenderingContext2D;
  return { context, fillStyles };
}

describe('皮肤色板画师接线', () => {
  it('paintWalletScene 以入参色板的主体色绘制钱包体', () => {
    const palette = resolveWalletLeatherPalette('wallet-dusk');
    const recording = createFillStyleRecordingContext();
    paintWalletScene(recording.context, {
      walletRect: { left: 97, top: 367, width: 209, height: 386 },
      foldLineY: 541,
      flapRotationDegrees: 0,
      breathingScale: 1,
      flapFaceSurfaces: null,
      walletLeatherPalette: palette,
      activeSkinId: 'wallet-dusk',
    });
    // 钱包体填充必须出现暮蓝主体色，而非 classic 的 #B08968
    expect(recording.fillStyles).toContain(palette.bodyColorHex);
    expect(recording.fillStyles).not.toContain('#B08968');
  });

  it('drawFlapFrontFaceArt 以入参色板绘制翻盖正面底色', () => {
    const palette = resolveWalletLeatherPalette('wallet-berry');
    const recording = createFillStyleRecordingContext();
    drawFlapFrontFaceArt(recording.context, 209, 174, palette);
    expect(recording.fillStyles).toContain(palette.bodyColorHex);
  });

  it('paintLaiBanknote 带 bill 皮肤时以混合色落笔', () => {
    const recording = createFillStyleRecordingContext();
    paintLaiBanknote(
      recording.context,
      { left: 100, top: 400, width: 190, height: 150 },
      'denomination-1',
      0,
      'bill-sage',
    );
    const expected = resolveBillColors('denomination-1', 'bill-sage');
    expect(recording.fillStyles).toContain(expected.baseColorHex);
    expect(recording.fillStyles).not.toContain('#A9C4AE');
  });

  it('paintLaiBanknote 无皮肤参数保持面额原色（默认路径零回归）', () => {
    const recording = createFillStyleRecordingContext();
    paintLaiBanknote(recording.context, { left: 100, top: 400, width: 190, height: 150 }, 'denomination-1');
    expect(recording.fillStyles).toContain('#A9C4AE');
  });
});
