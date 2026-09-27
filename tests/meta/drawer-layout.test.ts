import { describe, expect, it } from 'vitest';
import {
  computeOverlayLayout,
  resolveOverlayHit,
} from '../../src/core/meta/overlay-layout';

/**
 * 元进程抽屉布局与命中单测（meta-side-drawer 变更任务 1，meta-progression 规格 v2）：
 * 抽屉几何（贴右缘/安全区/滑入平移）、两级导航按钮、动画期命中防护、衬底关闭。
 * 「看到的 = 可点的」：布局是画师与命中的单一事实源。
 */

const VIEWPORT_WIDTH = 402;
const VIEWPORT_HEIGHT = 874;
const SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };
const SKIN_IDS = ['wallet-classic', 'wallet-caramel', 'wallet-moss', 'bill-sage'];
/** 全量 9 款皮肤（审查实测：固定卡高时 2 列折 5 行会溢出抽屉底缘） */
const FULL_SKIN_IDS = [
  'wallet-classic', 'wallet-caramel', 'wallet-moss', 'wallet-dusk', 'wallet-berry',
  'bill-sage', 'bill-amber', 'bill-porcelain', 'bill-aurum',
];

describe('抽屉几何', () => {
  it('贴屏幕右缘，纵向在安全区内，宽度=视口 80% 且上限 400', () => {
    const layout = computeOverlayLayout('menu', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    expect(layout.panelRect.left + layout.panelRect.width).toBeCloseTo(VIEWPORT_WIDTH, 3);
    expect(layout.panelRect.top).toBe(SAFE_AREA.top);
    expect(layout.panelRect.top + layout.panelRect.height).toBe(
      VIEWPORT_HEIGHT - SAFE_AREA.bottom,
    );
    // 402×0.8=321.6 < 400 → 取 80%
    expect(layout.panelRect.width).toBeCloseTo(321.6, 3);
    // 宽视口：900×0.8=720 > 400 → 取 400
    const wideLayout = computeOverlayLayout('menu', 900, VIEWPORT_HEIGHT, SAFE_AREA);
    expect(wideLayout.panelRect.width).toBe(400);
  });

  it('openProgress 驱动滑入偏移：1=贴合、0=完全屏外、0.5=半程', () => {
    const drawerWidth = 321.6;
    const open = computeOverlayLayout('menu', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, [], 1);
    expect(open.drawerSlideOffsetX).toBe(0);
    const closed = computeOverlayLayout('menu', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, [], 0);
    expect(closed.drawerSlideOffsetX).toBeCloseTo(drawerWidth, 3);
    const half = computeOverlayLayout('menu', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, [], 0.5);
    expect(half.drawerSlideOffsetX).toBeCloseTo(drawerWidth / 2, 3);
    // 越界钳制
    const overshoot = computeOverlayLayout('menu', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, [], 2);
    expect(overshoot.drawerSlideOffsetX).toBe(0);
  });

  it('菜单首屏：四行入口 + 关闭钮，全部落在抽屉内', () => {
    const layout = computeOverlayLayout('menu', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    const actions = layout.buttons.map((button) => button.action);
    expect(actions).toContain('menu-gallery');
    expect(actions).toContain('menu-skins');
    expect(actions).toContain('menu-achievements');
    expect(actions).toContain('menu-settings');
    for (const button of layout.buttons) {
      expect(button.hitRect.left).toBeGreaterThanOrEqual(layout.panelRect.left);
      expect(button.hitRect.left + button.hitRect.width)
        .toBeLessThanOrEqual(layout.panelRect.left + layout.panelRect.width);
      expect(button.hitRect.top).toBeGreaterThanOrEqual(layout.panelRect.top);
      expect(button.hitRect.top + button.hitRect.height)
        .toBeLessThanOrEqual(layout.panelRect.top + layout.panelRect.height);
    }
  });

  it('页面态提供返回菜单；隐私页返回目标是设置页', () => {
    const settings = computeOverlayLayout('settings', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    expect(settings.buttons.some((button) => button.action === 'back-to-menu')).toBe(true);
    const privacy = computeOverlayLayout('privacy', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    expect(privacy.buttons.some((button) => button.action === 'back-to-settings')).toBe(true);
  });

  it('皮肤网格：窄抽屉 2 列、宽抽屉 3 列，卡片数=皮肤数', () => {
    const narrow = computeOverlayLayout('skins', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, SKIN_IDS);
    expect(narrow.skinGridColumns).toBe(2);
    const narrowCards = narrow.buttons.filter((button) => button.action === 'select-skin');
    expect(narrowCards.length).toBe(SKIN_IDS.length);
    expect(narrowCards[0].skinId).toBe('wallet-classic');

    const wide = computeOverlayLayout('skins', 900, VIEWPORT_HEIGHT, SAFE_AREA, SKIN_IDS);
    expect(wide.skinGridColumns).toBe(3);
  });

  it('全量 9 款皮肤：全部卡片收进抽屉面板（卡高按可用高自适应）', () => {
    const layout = computeOverlayLayout('skins', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, FULL_SKIN_IDS);
    const cards = layout.buttons.filter((button) => button.action === 'select-skin');
    expect(cards.length).toBe(9);
    const panelBottom = layout.panelRect.top + layout.panelRect.height;
    for (const card of cards) {
      expect(card.hitRect.top).toBeGreaterThanOrEqual(layout.panelRect.top);
      // 末行不允许越过面板底缘（曾溢出 ~205px 致鎏金纹不可见不可点）
      expect(card.hitRect.top + card.hitRect.height).toBeLessThanOrEqual(panelBottom + 0.5);
    }
    // 卡片非退化：自适应压缩后仍有可视高度
    expect(cards[8].hitRect.height).toBeGreaterThan(40);
  });

  it('皮肤分组：钱包组卡片在前、纸币组在后，两节标题锚点有序且在面板内', () => {
    const layout = computeOverlayLayout('skins', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, FULL_SKIN_IDS);
    const skinButtons = layout.buttons.filter((button) => button.action === 'select-skin');
    const firstBillIndex = skinButtons.findIndex((button) => button.skinId?.startsWith('bill-'));
    // 钱包组（5 款）全部位于首个纸币卡之前
    expect(firstBillIndex).toBe(5);
    for (let index = 0; index < firstBillIndex; index += 1) {
      expect(skinButtons[index].skinId?.startsWith('wallet-')).toBe(true);
    }
    // 两节标题：钱包皮质在前、纸币纹样在后，纵向有序且落在面板内
    expect(layout.skinSectionAnchors.map((anchor) => anchor.title)).toEqual(['钱包皮质', '纸币纹样']);
    expect(layout.skinSectionAnchors[0].topY).toBeLessThan(layout.skinSectionAnchors[1].topY);
    for (const anchor of layout.skinSectionAnchors) {
      expect(anchor.topY).toBeGreaterThanOrEqual(layout.panelRect.top);
      expect(anchor.topY).toBeLessThanOrEqual(layout.panelRect.top + layout.panelRect.height);
    }
    // 纸币组首卡在「纸币纹样」标题之下
    const firstBillCard = skinButtons[firstBillIndex];
    expect(firstBillCard.hitRect.top).toBeGreaterThan(layout.skinSectionAnchors[1].topY);
  });

  it('设置页含三开关 + 隐私入口', () => {
    const layout = computeOverlayLayout('settings', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    const actions = layout.buttons.map((button) => button.action);
    expect(actions).toContain('toggle-sound');
    expect(actions).toContain('toggle-bgm');
    expect(actions).toContain('toggle-haptics');
    expect(actions).toContain('open-privacy');
  });
});

describe('抽屉命中解析', () => {
  it('点中菜单行返回该按钮（看到的=可点的）', () => {
    const layout = computeOverlayLayout('menu', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    const skinsEntry = layout.buttons.find((button) => button.action === 'menu-skins');
    if (!skinsEntry) throw new Error('菜单行缺失');
    const hit = resolveOverlayHit(
      layout,
      skinsEntry.hitRect.left + skinsEntry.hitRect.width / 2,
      skinsEntry.hitRect.top + skinsEntry.hitRect.height / 2,
    );
    expect(hit && hit !== 'close-overlay' && hit.action).toBe('menu-skins');
  });

  it('抽屉内空白处返回 null（不误关）', () => {
    const layout = computeOverlayLayout('gallery', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    const blankY = layout.panelRect.top + layout.panelRect.height - 30;
    expect(resolveOverlayHit(layout, layout.panelRect.left + 20, blankY)).toBeNull();
  });

  it('抽屉外（衬底）返回 close-overlay', () => {
    const layout = computeOverlayLayout('gallery', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA);
    expect(resolveOverlayHit(layout, 5, 500)).toBe('close-overlay');
  });

  it('动画期命中防护：滑入中点按钮位置不触发，点衬底可关闭', () => {
    const layout = computeOverlayLayout(
      'settings', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, [], 0.5,
    );
    const soundButton = layout.buttons.find((button) => button.action === 'toggle-sound');
    if (!soundButton) throw new Error('设置行缺失');
    // 按钮在抽屉可视区内的点：忽略（不触发、不关闭）
    const buttonHit = resolveOverlayHit(
      layout, VIEWPORT_WIDTH - 20, soundButton.hitRect.top + 10,
    );
    expect(buttonHit).toBeNull();
    // 抽屉尚未滑到的区域（视觉上是衬底）：立即关闭
    expect(resolveOverlayHit(layout, 5, 500)).toBe('close-overlay');
  });

  it('皮肤页点抽屉底缘之下的衬底返回 close-overlay（溢出卡不劫持）', () => {
    const layout = computeOverlayLayout('skins', VIEWPORT_WIDTH, VIEWPORT_HEIGHT, SAFE_AREA, FULL_SKIN_IDS);
    const belowDrawerY = layout.panelRect.top + layout.panelRect.height + 20;
    const belowDrawerX = layout.panelRect.left + layout.panelRect.width / 2;
    expect(resolveOverlayHit(layout, belowDrawerX, belowDrawerY)).toBe('close-overlay');
  });
});
