import { describe, expect, it } from 'vitest';
import { computeOverlayLayout, overlayPageDataCacheKey } from '../../src/core/meta/overlay-layout';
import { paintMetaOverlay } from '../../src/core/render/overlay-painter';
import { createInitialPersistedGameState } from '../../src/core/meta/game-state';
import type { OffscreenCanvasSurface } from '../../src/core/platform';

/**
 * 抽屉动画性能（meta-side-drawer 实测反馈追加）：
 * ① 页面数据缓存键覆盖全部内容变化源（stage/图鉴/皮肤解锁/双槽选中/成就/设置）；
 * ② 有离屏缓存层时：动画帧零 shadowBlur、面板以缓存层一次 drawImage 合成（视觉像素不变）；
 *    无离屏能力（无头等）走原 shadowBlur 慢路径，样式不变。
 */

const VIEWPORT = { width: 402, height: 874 };
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };
const layout = computeOverlayLayout('menu', VIEWPORT.width, VIEWPORT.height, SAFE_AREA, [], 1);

describe('抽屉页面数据缓存键', () => {
  it('内容不变时键稳定', () => {
    const state = createInitialPersistedGameState();
    expect(overlayPageDataCacheKey(state, 'skins')).toBe(overlayPageDataCacheKey(state, 'skins'));
  });

  it('stage / 皮肤解锁 / 双槽选中 / 图鉴 / 成就 / 任一设置开关 变化都换键', () => {
    const base = createInitialPersistedGameState();
    const baseKey = overlayPageDataCacheKey(base, 'menu');

    expect(overlayPageDataCacheKey(base, 'settings')).not.toBe(baseKey);

    const unlocked = { ...base, unlockedSkins: [...base.unlockedSkins, 'wallet-caramel'] };
    expect(overlayPageDataCacheKey(unlocked, 'menu')).not.toBe(baseKey);

    const switched = { ...base, activeWalletSkin: 'wallet-caramel' };
    expect(overlayPageDataCacheKey(switched, 'menu')).not.toBe(baseKey);

    const galleryGrown = { ...base, gallery: { ...base.gallery, 'denomination-1': 1 } };
    expect(overlayPageDataCacheKey(galleryGrown, 'menu')).not.toBe(baseKey);

    const achieved = { ...base, achievements: [...base.achievements, 'first-draw'] };
    expect(overlayPageDataCacheKey(achieved, 'menu')).not.toBe(baseKey);

    const soundOff = { ...base, settings: { ...base.settings, soundEnabled: false } };
    expect(overlayPageDataCacheKey(soundOff, 'menu')).not.toBe(baseKey);

    const bgmOff = { ...base, settings: { ...base.settings, bgmEnabled: false } };
    expect(overlayPageDataCacheKey(bgmOff, 'menu')).not.toBe(baseKey);

    const hapticsOff = { ...base, settings: { ...base.settings, hapticsEnabled: false } };
    expect(overlayPageDataCacheKey(hapticsOff, 'menu')).not.toBe(baseKey);
  });
});

describe('抽屉面板绘制（缓存层快路径 / 原样式慢路径）', () => {
  interface Recording {
    shadowBlurValues: number[];
    panelLayerDraws: number;
  }

  function createRecordingContext(recording: Recording) {
    const gradientStub = { addColorStop() {} };
    const context = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'measureText') return () => ({ width: 12 });
          if (property === 'createLinearGradient') return () => gradientStub;
          if (property === 'drawImage') {
            return (image: unknown, ..._args: number[]) => {
              if ((image as { marker?: string } | null)?.marker === 'drawer-panel-layer') {
                recording.panelLayerDraws += 1;
              }
            };
          }
          return () => {};
        },
        set(target, property, value) {
          if (property === 'shadowBlur') recording.shadowBlurValues.push(Number(value));
          return Reflect.set(target as object, property, value);
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    return context;
  }

  const pageData = {
    galleryEntries: [],
    skins: [],
    achievements: [],
    settings: createInitialPersistedGameState().settings,
  };

  const panelLayerSurface: OffscreenCanvasSurface = {
    renderingContext: {} as CanvasRenderingContext2D,
    sourceSurface: { marker: 'drawer-panel-layer' } as unknown as CanvasImageSource,
    pixelWidth: 400,
    pixelHeight: 900,
  };

  it('快路径：零 shadowBlur，面板以缓存层一次合成', () => {
    const recording: Recording = { shadowBlurValues: [], panelLayerDraws: 0 };
    paintMetaOverlay(createRecordingContext(recording), layout, pageData, panelLayerSurface);
    expect(recording.shadowBlurValues.every((value) => value === 0)).toBe(true);
    expect(recording.panelLayerDraws).toBe(1);
  });

  it('慢路径（无离屏能力）：保持原 shadowBlur 样式，视觉不降级', () => {
    const recording: Recording = { shadowBlurValues: [], panelLayerDraws: 0 };
    paintMetaOverlay(createRecordingContext(recording), layout, pageData, null);
    expect(recording.shadowBlurValues).toContain(30);
    expect(recording.panelLayerDraws).toBe(0);
  });
});
