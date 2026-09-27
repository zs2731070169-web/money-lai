import { describe, expect, it } from 'vitest';
import { resolveRenderScale } from '../../src/adapters/web';

/**
 * 渲染缩放解析（lift-render-dpr-cap 验证入口）：
 * 3x 设备须获得原生分辨率 backing store（修全图圆角锯齿），上限 3 防超高 DPI 无限填充。
 */
describe('resolveRenderScale：主画布渲染 DPR 解析', () => {
  it('1x / 2x / 3x 设备各自原生缩放（3x 不再锁 2）', () => {
    expect(resolveRenderScale(1)).toBe(1);
    expect(resolveRenderScale(2)).toBe(2);
    expect(resolveRenderScale(3)).toBe(3);
  });

  it('超高 DPI 封顶 3（填充率护栏）；异常值下限 1', () => {
    expect(resolveRenderScale(4)).toBe(3);
    expect(resolveRenderScale(0)).toBe(1);
    expect(resolveRenderScale(-2)).toBe(1);
  });
});
