import { Rect } from '../wallet/flap-hit-test';
import { SafeAreaInsets } from '../platform';
import { SKIN_COLLECTION } from './skins';
import type { PersistedGameStateV1 } from './game-state';

/**
 * 元进程抽屉布局（meta-progression 规格 v2：右侧滑出抽屉 + 两级导航）。
 * 纯函数布局 + 命中解析：画师按同一布局绘制、游戏按同一布局判定点击，
 * 单一事实源保证「看到的 = 可点的」。
 * openProgress 为入参（0~1），布局本身无时钟无副作用，动画推进由编排层逐帧喂入。
 */

export type OverlayPageKind =
  | 'gallery'
  | 'skins'
  | 'achievements'
  | 'sleep-ledger'
  | 'settings'
  | 'privacy';

/** 抽屉阶段：menu=菜单列表首屏；其余=在抽屉内展示对应页面 */
export type DrawerStage = 'menu' | OverlayPageKind;

export interface OverlayButton {
  /** 点击语义标识 */
  action:
    | 'close'
    | 'menu-gallery'
    | 'menu-skins'
    | 'menu-achievements'
    | 'menu-sleep-ledger'
    | 'menu-settings'
    | 'back-to-menu'
    | 'back-to-settings'
    | 'toggle-sound'
    | 'toggle-bgm'
    | 'toggle-haptics'
    | 'toggle-bedtime-mode'
    | 'open-privacy'
    | 'select-skin';
  /** 命中矩形（含皮肤卡等动态项；坐标基于完全展开的抽屉位置） */
  hitRect: Rect;
  /** 皮肤卡的皮肤 id（action=select-skin 时有效） */
  skinId?: string;
  /** 按钮显示文案 */
  label: string;
}

export interface OverlayLayout {
  /** 抽屉阶段（菜单或页面） */
  stage: DrawerStage;
  /** 半透明衬底矩形（全屏，点击抽屉外区域=关闭） */
  scrimRect: Rect;
  /** 抽屉矩形（完全展开位置：贴屏幕右缘、纵向满安全区） */
  panelRect: Rect;
  /** 滑入偏移：(1-openProgress)×抽屉宽，0=完全展开；画师按此平移绘制 */
  drawerSlideOffsetX: number;
  /** 皮肤网格列数（窄抽屉 2 列、宽抽屉 3 列，命中与绘制同源） */
  skinGridColumns: number;
  /** 皮肤页分组节标题锚点（仅 skins 阶段非空；grouped-skin-selection） */
  skinSectionAnchors: Array<{ title: string; topY: number }>;
  /** 可点击按钮清单（含菜单行、返回、开关、皮肤卡） */
  buttons: OverlayButton[];
}

/** 抽屉宽度：视口 80%，上限 400（设计 D1） */
function drawerWidthFor(viewportWidth: number): number {
  return Math.min(viewportWidth * 0.8, 400);
}

/** 皮肤网格内容宽阈值：低于此值 2 列，否则 3 列（设计 D4） */
const SKIN_GRID_WIDE_CONTENT_WIDTH = 340;
/** 皮肤卡网格间距 */
const SKIN_CARD_GAP = 10;
/** 皮肤分节标题行高与间距（钱包皮质 / 纸币纹样两节） */
const SKIN_SECTION_TITLE_HEIGHT = 24;
const SKIN_SECTION_GAP = 10;

export function computeOverlayLayout(
  stage: DrawerStage,
  viewportWidth: number,
  viewportHeight: number,
  safeArea: SafeAreaInsets,
  skinIds: string[] = [],
  openProgress: number = 1,
): OverlayLayout {
  const drawerWidth = drawerWidthFor(viewportWidth);
  const drawerRect: Rect = {
    left: viewportWidth - drawerWidth,
    top: safeArea.top,
    width: drawerWidth,
    height: viewportHeight - safeArea.top - safeArea.bottom,
  };
  const clampedProgress = Math.min(1, Math.max(0, openProgress));
  // 皮肤网格列数：随抽屉内容宽自适应（非皮肤页不消费，仅随布局下发保持单一来源）
  const skinGridColumns =
    (drawerWidth - 24) < SKIN_GRID_WIDE_CONTENT_WIDTH ? 2 : 3;
  const buttons: OverlayButton[] = [];

  // 头部行：页面态提供返回（隐私页返回目标=设置页），右上角关闭 ×
  if (stage !== 'menu') {
    buttons.push({
      action: stage === 'privacy' ? 'back-to-settings' : 'back-to-menu',
      label: '‹ 返回',
      hitRect: { left: drawerRect.left + 8, top: drawerRect.top + 8, width: 76, height: 40 },
    });
  }
  buttons.push({
    action: 'close',
    label: '×',
    hitRect: {
      left: drawerRect.left + drawerWidth - 48,
      top: drawerRect.top + 6,
      width: 44,
      height: 44,
    },
  });

  // 菜单首屏：图鉴/皮肤/成就/睡眠账本/设置五行入口（sleep-mode 规格扩为五条目）
  if (stage === 'menu') {
    const menuKinds: Array<[OverlayButton['action'], string]> = [
      ['menu-gallery', '图鉴'],
      ['menu-skins', '皮肤'],
      ['menu-achievements', '成就'],
      ['menu-sleep-ledger', '睡眠账本'],
      ['menu-settings', '设置'],
    ];
    menuKinds.forEach(([action, label], rowIndex) => {
      buttons.push({
        action,
        label,
        hitRect: {
          left: drawerRect.left + 16,
          top: drawerRect.top + 76 + rowIndex * 58,
          width: drawerWidth - 32,
          height: 50,
        },
      });
    });
  }

  // 页面内容起点：头部行（56）+ 间距之下
  const contentTop = drawerRect.top + 72;

  // 设置页开关行
  if (stage === 'settings') {
    const rowHeight = 52;
    const rowLeft = drawerRect.left + 16;
    const rowWidth = drawerWidth - 32;
    (
      [
        ['toggle-sound', '音效'],
        ['toggle-bgm', '背景音乐'],
        ['toggle-haptics', '触觉反馈'],
        ['toggle-bedtime-mode', '晚安模式'],
        ['open-privacy', '隐私政策'],
      ] as Array<[OverlayButton['action'], string]>
    ).forEach(([action, label], rowIndex) => {
      buttons.push({
        action,
        label,
        hitRect: {
          left: rowLeft,
          top: contentTop + 8 + rowIndex * rowHeight,
          width: rowWidth,
          height: rowHeight - 8,
        },
      });
    });
  }

  // 皮肤卡网格：按「钱包皮质 / 纸币纹样」分两节（含锁定/启用态由画师渲染，命中矩形只管位置）
  const skinSectionAnchors: Array<{ title: string; topY: number }> = [];
  if (stage === 'skins') {
    const contentWidth = drawerWidth - 24;
    const cardWidth =
      (contentWidth - SKIN_CARD_GAP * (skinGridColumns - 1)) / skinGridColumns;
    // 双组分节：钱包组在前、纸币组在后（皮肤表按 kind 归类）
    const skinKindById = new Map(SKIN_COLLECTION.map((skin) => [skin.id, skin.kind]));
    const walletSkinIds = skinIds.filter((skinId) => skinKindById.get(skinId) !== 'bill');
    const billSkinIds = skinIds.filter((skinId) => skinKindById.get(skinId) === 'bill');
    // 卡高按抽屉可用高自适应：两节全部行 + 节标题占位必须收进面板
    const gridTop = contentTop + 8;
    const availableHeight = drawerRect.top + drawerRect.height - gridTop - 16;
    const walletRowCount = Math.max(1, Math.ceil(walletSkinIds.length / skinGridColumns));
    const billRowCount = Math.max(1, Math.ceil(billSkinIds.length / skinGridColumns));
    const totalRowCount = walletRowCount + billRowCount;
    const sectionChrome = 2 * (SKIN_SECTION_TITLE_HEIGHT + SKIN_SECTION_GAP) + SKIN_SECTION_GAP;
    const cardHeight = Math.min(
      cardWidth * 1.2,
      (availableHeight - sectionChrome - SKIN_CARD_GAP * (totalRowCount - 1)) / totalRowCount,
    );
    const walletSectionTop = gridTop;
    const walletGridTop = walletSectionTop + SKIN_SECTION_TITLE_HEIGHT + SKIN_SECTION_GAP;
    const walletGridBottom =
      walletGridTop + walletRowCount * cardHeight + (walletRowCount - 1) * SKIN_CARD_GAP;
    const billSectionTop = walletGridBottom + SKIN_SECTION_GAP;
    const billGridTop = billSectionTop + SKIN_SECTION_TITLE_HEIGHT + SKIN_SECTION_GAP;
    skinSectionAnchors.push({ title: '钱包皮质', topY: walletSectionTop });
    if (billSkinIds.length > 0) {
      skinSectionAnchors.push({ title: '纸币纹样', topY: billSectionTop });
    }
    const gridGroups: Array<{ skinIds: string[]; gridTop: number }> = [
      { skinIds: walletSkinIds, gridTop: walletGridTop },
      { skinIds: billSkinIds, gridTop: billGridTop },
    ];
    for (const gridGroup of gridGroups) {
      gridGroup.skinIds.forEach((skinId, skinIndex) => {
        const columnIndex = skinIndex % skinGridColumns;
        const rowIndex = Math.floor(skinIndex / skinGridColumns);
        buttons.push({
          action: 'select-skin',
          label: skinId,
          skinId,
          hitRect: {
            left: drawerRect.left + 12 + columnIndex * (cardWidth + SKIN_CARD_GAP),
            top: gridGroup.gridTop + rowIndex * (cardHeight + SKIN_CARD_GAP),
            width: cardWidth,
            height: cardHeight,
          },
        });
      });
    }
  }

  return {
    stage,
    scrimRect: { left: 0, top: 0, width: viewportWidth, height: viewportHeight },
    panelRect: drawerRect,
    drawerSlideOffsetX: (1 - clampedProgress) * drawerRect.width,
    skinGridColumns,
    skinSectionAnchors,
    buttons,
  };
}

/**
 * 命中解析：返回点击到的按钮；点到抽屉外（衬底）返回 'close-overlay'；抽屉内空白返回 null。
 * 滑入/滑出动画期（未完全展开）：抽屉按钮一律不触发——抽屉当前可视区内的点忽略，
 * 可视区之外视觉上是衬底，立即关闭（规格：动画期命中防护）。
 */
export function resolveOverlayHit(
  layout: OverlayLayout,
  pointX: number,
  pointY: number,
): OverlayButton | 'close-overlay' | null {
  if (layout.drawerSlideOffsetX > 0.5) {
    const visualDrawerLeft = layout.panelRect.left + layout.drawerSlideOffsetX;
    const insideVisualDrawer =
      pointX >= visualDrawerLeft &&
      pointX <= layout.panelRect.left + layout.panelRect.width &&
      pointY >= layout.panelRect.top &&
      pointY <= layout.panelRect.top + layout.panelRect.height;
    return insideVisualDrawer ? null : 'close-overlay';
  }
  for (const button of layout.buttons) {
    const { hitRect } = button;
    if (
      pointX >= hitRect.left &&
      pointX <= hitRect.left + hitRect.width &&
      pointY >= hitRect.top &&
      pointY <= hitRect.top + hitRect.height
    ) {
      return button;
    }
  }
  const insideDrawer =
    pointX >= layout.panelRect.left &&
    pointX <= layout.panelRect.left + layout.panelRect.width &&
    pointY >= layout.panelRect.top &&
    pointY <= layout.panelRect.top + layout.panelRect.height;
  return insideDrawer ? null : 'close-overlay';
}

/**
 * 抽屉页面数据缓存键（meta-side-drawer 动画性能）：
 * 覆盖页面内容的全部变化源——stage、图鉴首抽、皮肤解锁（只增不减→长度）、
 * 双槽选中皮肤、成就（只增不减→长度）、设置三开关、睡眠账本条数。
 * 键稳定 ⇔ 页面数据可复用，动画帧上零重建零分配。
 */
export function overlayPageDataCacheKey(
  state: PersistedGameStateV1,
  stage: DrawerStage,
): string {
  const { soundEnabled, bgmEnabled, hapticsEnabled } = state.settings;
  return [
    stage,
    Object.keys(state.gallery).length,
    state.unlockedSkins.length,
    state.activeWalletSkin,
    String(state.activeBillSkin),
    state.achievements.length,
    soundEnabled ? 1 : 0,
    bgmEnabled ? 1 : 0,
    hapticsEnabled ? 1 : 0,
    (state.sleepLedger ?? []).length,
  ].join('|');
}

/** 早安卡布局（sleep-mode 规格「会话封存与早安卡」）：瞬态居中卡片 + 关闭按钮，纯函数 */
export interface MorningCardLayout {
  /** 轻衬底矩形（全屏，聚焦卡片；点按衬底不关闭——只有按钮关闭，避免误触） */
  scrimRect: Rect;
  /** 卡片矩形 */
  cardRect: Rect;
  /** 「开始新的一天」关闭按钮矩形（看到的=可点的） */
  dismissButtonRect: Rect;
}

export function computeMorningCardLayout(
  viewportWidth: number,
  viewportHeight: number,
): MorningCardLayout {
  const cardWidth = Math.min(viewportWidth - 48, 340);
  const cardHeight = 204;
  const cardLeft = (viewportWidth - cardWidth) / 2;
  const cardTop = viewportHeight * 0.3;
  return {
    scrimRect: { left: 0, top: 0, width: viewportWidth, height: viewportHeight },
    cardRect: { left: cardLeft, top: cardTop, width: cardWidth, height: cardHeight },
    dismissButtonRect: {
      left: cardLeft + cardWidth / 2 - 80,
      top: cardTop + cardHeight - 60,
      width: 160,
      height: 44,
    },
  };
}
