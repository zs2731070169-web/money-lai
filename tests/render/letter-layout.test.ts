import { describe, expect, it } from 'vitest';
import { computeLetterSceneLayout } from '../../src/core/render/letter-layout';

describe('燃信场景布局', () => {
  const devices = [
    { name: 'iPhone SE', width: 375, height: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
    { name: 'iPhone 17', width: 402, height: 874, safe: { top: 62, bottom: 34, left: 0, right: 0 } },
    { name: 'Pro Max', width: 440, height: 956, safe: { top: 62, bottom: 34, left: 0, right: 0 } },
  ];
  for (const device of devices) {
    it(`${device.name} 信封、明信片、菜单和甩出起点均在安全区内`, () => {
      const layout = computeLetterSceneLayout(device.width, device.height, device.safe);
      expect(layout.envelopeRect.top + layout.envelopeRect.height).toBeLessThanOrEqual(device.height - device.safe.bottom);
      expect(layout.cardRect.top).toBeGreaterThan(device.safe.top);
      expect(layout.menuRect.top).toBeGreaterThanOrEqual(device.safe.top);
      expect(layout.systemGestureBoundaryY).toBeLessThan(device.height - device.safe.bottom);
    });
    it(`${device.name} 信纸保持素材竖版比例，并以自然半页高度对折插入信封`, () => {
      const layout = computeLetterSceneLayout(device.width, device.height, device.safe);
      expect(layout.cardRect.height / layout.cardRect.width).toBeCloseTo(733 / 491, 2);
      expect(layout.cardRect.top + layout.cardRect.height).toBeLessThanOrEqual(layout.envelopeRect.top - 24);
      expect(layout.foldedCardRect.width).toBe(layout.cardRect.width);
      expect(layout.foldedCardRect.height).toBeCloseTo(layout.cardRect.height / 2, 5);
      expect(layout.foldedCardRect.left).toBe(layout.cardRect.left);
      expect(layout.foldedCardRect.top).toBeGreaterThan(layout.cardRect.top);
      expect(layout.foldedCardRect.top + layout.foldedCardRect.height)
        .toBeLessThanOrEqual(layout.envelopeRect.top + layout.envelopeRect.height);
      expect(layout.exposedCardRect.left).toBe(layout.foldedCardRect.left);
      expect(layout.exposedCardRect.top).toBe(layout.foldedCardRect.top);
      expect(layout.exposedCardRect.height).toBeCloseTo(layout.foldedCardRect.height * 0.38, 5);
      expect(layout.exposedCardRect.height).toBeGreaterThan(40);
    });
  }
});
