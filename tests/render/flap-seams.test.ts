import { describe, expect, it } from 'vitest';
import type { OffscreenCanvasSurface } from '../../src/core/platform';
import {
  FLAP_FACE_FULL_SPREAD_RATIO,
  FLAP_THICKNESS_MIN_SPREAD_RATIO,
  flapProjectedSpreadRatio,
  FLAP_STRIP_COUNT,
  isFlapBackFaceVisible,
} from '../../src/core/render/flap-projection';
import { paintWalletScene } from '../../src/core/render/wallet-painter';
import { resolveWalletLeatherPalette } from '../../src/core/render/skin-palettes';

interface DrawImageCall {
  sourceTop: number;
  sourceHeight: number;
  top: number;
  height: number;
}

function recordingCanvas() {
  const images: DrawImageCall[] = [];
  let clipCount = 0;
  const context = {
    globalAlpha: 1,
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
    beginPath() {}, rect() {}, ellipse() {}, fillText() {}, fillRect() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {}, setLineDash() {},
    clip() { clipCount += 1; },
    createLinearGradient() { return { addColorStop() {} }; },
    drawImage(
      _image: CanvasImageSource,
      _sourceLeft: number,
      sourceTop: number,
      _sourceWidth: number,
      sourceHeight: number,
      _left: number,
      top: number,
      _width: number,
      height: number,
    ) {
      images.push({ sourceTop, sourceHeight, top, height });
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, images, get clipCount() { return clipCount; } };
}

function faceSurface(): OffscreenCanvasSurface {
  return {
    renderingContext: {} as CanvasRenderingContext2D,
    sourceSurface: {} as CanvasImageSource,
    pixelWidth: 209,
    pixelHeight: 174,
  };
}

function paintAtAngle(angle: number) {
  const recording = recordingCanvas();
  const face = faceSurface();
  paintWalletScene(recording.context, {
    walletRect: { left: 97, top: 367, width: 209, height: 386 },
    foldLineY: 541,
    flapRotationDegrees: angle,
    breathingScale: 1,
    flapFaceSurfaces: { front: face, back: face },
    walletLeatherPalette: resolveWalletLeatherPalette(null),
  });
  return recording;
}

describe('翻盖纹理条带连续性', () => {
  it.each([0, 30, 45, 90, 120, 166, 180])(
    '%d° 时只裁剪整体轮廓，源纹理和画面条带均无间隙',
    (angle) => {
      const result = paintAtAngle(angle);
      // 纸币堆内部区域裁剪 1 次 + 条带整体轮廓 1 次（遮挡揭示语义引入）
      expect(result.clipCount).toBe(2);
      expect(result.images).toHaveLength(FLAP_STRIP_COUNT);

      const byDestination = [...result.images].sort((a, b) => a.top - b.top);
      for (let index = 1; index < byDestination.length; index += 1) {
        const previous = byDestination[index - 1];
        const current = byDestination[index];
        expect(current.top).toBeLessThan(previous.top + previous.height);
      }

      const bySource = [...result.images].sort((a, b) => a.sourceTop - b.sourceTop);
      for (let index = 1; index < bySource.length; index += 1) {
        const previous = bySource[index - 1];
        const current = bySource[index];
        expect(current.sourceTop).toBeLessThan(previous.sourceTop + previous.sourceHeight);
      }
    },
  );

  it('侧对视线时以皮革厚度替代极窄纹理', () => {
    const edgeAngle = Array.from({ length: 181 }, (_, angle) => angle).find(
      (angle) => flapProjectedSpreadRatio(angle, 174, 209) < FLAP_THICKNESS_MIN_SPREAD_RATIO,
    );
    expect(edgeAngle).toBeDefined();
    const result = paintAtAngle(edgeAngle!);
    expect(result.images).toHaveLength(0);
    // 侧对时无条带轮廓，仅纸币堆内部区域裁剪
    expect(result.clipCount).toBe(1);
  });

  it.each([false, true])('背面可见=%s 的过渡角仍绘制表面条带，避免硬切矩形', (backFaceVisible) => {
    const transitionAngle = Array.from({ length: 181 }, (_, angle) => angle).find(
      (angle) => {
        const spread = flapProjectedSpreadRatio(angle, 174, 209);
        return isFlapBackFaceVisible(angle, 174, 209) === backFaceVisible &&
          spread > FLAP_THICKNESS_MIN_SPREAD_RATIO && spread < FLAP_FACE_FULL_SPREAD_RATIO;
      },
    );
    expect(transitionAngle).toBeDefined();
    const result = paintAtAngle(transitionAngle!);
    expect(result.images).toHaveLength(FLAP_STRIP_COUNT);
    expect(result.clipCount).toBe(3);
  });
});
