import { describe, expect, it } from 'vitest';
import { JOURNAL_HEADER_BAND_HEIGHT } from '../../src/core/journal/journal-layout';
import { paintPageFade } from '../../src/core/render/letter-painter';

describe('清空渐隐只覆盖网格区（banner 不参与）', () => {
  it('渐隐矩形从页眉带底缘开始，不满屏；透明度随进度推进', () => {
    const fills: Array<{ style: string; rect: number[] }> = []; const gradient = { addColorStop() {} };
    let fillStyle = '';
    const context = new Proxy({}, {
      get(_target, property) {
        if (property === 'fillRect') return (...args: number[]) => fills.push({ style: fillStyle, rect: args });
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
        if (property === 'measureText') return () => ({ width: 20 });
        return () => undefined;
      },
      set(_target, property, value) { if (property === 'fillStyle') fillStyle = String(value); return true; },
    }) as unknown as CanvasRenderingContext2D;
    paintPageFade(context, 402, 874, 0.5, 62 + JOURNAL_HEADER_BAND_HEIGHT);
    expect(fills.length).toBe(1);
    expect(fills[0].rect).toEqual([0, 134, 402, 740]); // 页眉带（62+72）之下才开始渐隐
    expect(fills[0].style).toBe('rgba(247,239,228,0.5)');
  });
});
