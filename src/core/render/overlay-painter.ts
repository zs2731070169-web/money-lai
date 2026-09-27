import { OverlayLayout } from '../meta/overlay-layout';
import { PersistedGameSettings } from '../meta/game-state';
import { GalleryEntry } from '../meta/gallery';
import { AchievementDefinition } from '../meta/achievements';
import { SkinDefinition } from '../meta/skins';
import { Rect } from '../wallet/flap-hit-test';
import {
  BILL_PAPER_BASE_COLOR_HEX,
  INK_TEXT_COLOR_HEX,
  getDenominationColors,
} from './design-tokens';
import { resolveBillSkinTint, resolveWalletLeatherPalette } from './skin-palettes';
import type { OffscreenCanvasSurface } from '../platform';
import { buildRoundedRectPath } from './canvas-shapes';

/**
 * 元进程覆盖层画师（meta-progression 规格 v2 抽屉 + 8.1 标题页 + 7.3 轻提示）。
 * 布局与命中同源（overlay-layout），保证「看到的 = 可点的」；
 * 抽屉按 drawerSlideOffsetX 平移绘制，内容坐标基于完全展开位置。
 */

const UI_FONT_STACK = "'PingFang SC', sans-serif";
const PANEL_FILL_COLOR = 'rgba(250, 244, 234, 0.96)';
const SCRIM_COLOR = 'rgba(61, 44, 32, 0.35)';
const MUTED_TEXT_COLOR = '#8B8579';
const CARD_FILL_COLOR = '#FFFFFF';

/** 隐私政策文案（Data Not Collected 口径，9.1 的 App 内入口） */
export const PRIVACY_POLICY_TEXT_LINES = [
  '隐私政策',
  '',
  '本应用不收集、不存储、不上传个人信息。',
  '游戏进度（图鉴、皮肤解锁、成就与设置）仅保存在你的设备本地，',
  '不会与开发者或任何第三方共享。',
  '本应用不含账号系统、广告、分析统计与任何第三方 SDK。',
  '',
  '联系方式：通过 App Store 开发者页面联系开发者。',
];

export interface OverlayPageData {
  galleryEntries: GalleryEntry[];
  skins: Array<{ definition: SkinDefinition; unlocked: boolean; active: boolean }>;
  achievements: Array<{ definition: AchievementDefinition; achieved: boolean }>;
  settings: PersistedGameSettings;
}

/** 首屏菜单标题（页面态头部只留返回钮，不显示标题——实测反馈微调） */
const MENU_STAGE_TITLE = '菜单';

/** 面板投影缓存层的外扩余量（逻辑像素）：覆盖 shadowBlur=30 的模糊外溢 */
export const DRAWER_PANEL_SHADOW_BLEED_PIXELS = 40;

/**
 * 面板+投影缓存层内容（meta-side-drawer 动画性能）：
 * 在 (0,0) 起的 width×height 画布上绘制「内缩 bleed 的左圆角面板 + shadowBlur 投影」，
 * 与慢路径逐帧绘制的像素一致——由 Game 按面板尺寸构建并缓存，动画帧仅一次 drawImage。
 */
export function drawDrawerPanelLayerArt(
  renderingContext: CanvasRenderingContext2D,
  layerWidth: number,
  layerHeight: number,
): void {
  const bleed = DRAWER_PANEL_SHADOW_BLEED_PIXELS;
  const panelRect: Rect = {
    left: bleed,
    top: bleed,
    width: layerWidth - bleed * 2,
    height: layerHeight - bleed * 2,
  };
  renderingContext.save();
  renderingContext.shadowColor = 'rgba(61, 44, 32, 0.25)';
  renderingContext.shadowBlur = 30;
  buildLeftRoundedRectPath(renderingContext, panelRect, 22);
  renderingContext.fillStyle = PANEL_FILL_COLOR;
  renderingContext.fill();
  renderingContext.restore();
}

export function paintMetaOverlay(
  renderingContext: CanvasRenderingContext2D,
  layout: OverlayLayout,
  pageData: OverlayPageData,
  panelLayerSurface?: OffscreenCanvasSurface | null,
): void {
  // 衬底（点击抽屉外即关闭；随开合进度淡入淡出）
  const openRatio = layout.panelRect.width > 0
    ? 1 - layout.drawerSlideOffsetX / layout.panelRect.width
    : 1;
  renderingContext.save();
  renderingContext.globalAlpha = Math.min(1, Math.max(0, openRatio));
  renderingContext.fillStyle = SCRIM_COLOR;
  renderingContext.fillRect(layout.scrimRect.left, layout.scrimRect.top, layout.scrimRect.width, layout.scrimRect.height);
  renderingContext.restore();

  // 抽屉本体：按滑入偏移平移绘制（仅左侧圆角，右缘贴屏幕）。
  // 全高 shadowBlur 在移动端 WebView 走 CPU 路径，是滑入/滑出动画卡顿的实测主源
  // （meta-side-drawer 性能反馈）——设备路径用预渲染缓存层一次合成（像素与慢路径一致）；
  // 无离屏能力（无头/降级）时走下方原样式逐帧路径，视觉不降级
  renderingContext.save();
  renderingContext.translate(layout.drawerSlideOffsetX, 0);
  if (panelLayerSurface) {
    const bleed = DRAWER_PANEL_SHADOW_BLEED_PIXELS;
    renderingContext.drawImage(
      panelLayerSurface.sourceSurface,
      0,
      0,
      panelLayerSurface.pixelWidth,
      panelLayerSurface.pixelHeight,
      layout.panelRect.left - bleed,
      layout.panelRect.top - bleed,
      layout.panelRect.width + bleed * 2,
      layout.panelRect.height + bleed * 2,
    );
  } else {
    renderingContext.shadowColor = 'rgba(61, 44, 32, 0.25)';
    renderingContext.shadowBlur = 30;
    buildLeftRoundedRectPath(renderingContext, layout.panelRect, 22);
    renderingContext.fillStyle = PANEL_FILL_COLOR;
    renderingContext.fill();
  }
  renderingContext.restore();

  // 抽屉内容整体在同一平移空间内绘制，并裁剪在面板矩形内
  // （布局已保证常规几何收进面板，裁剪是极端视口下的绘制兜底）
  renderingContext.save();
  renderingContext.translate(layout.drawerSlideOffsetX, 0);
  renderingContext.beginPath();
  renderingContext.rect(
    layout.panelRect.left,
    layout.panelRect.top,
    layout.panelRect.width,
    layout.panelRect.height,
  );
  renderingContext.clip();

  // 头部行：返回（页面态）+ 关闭 ×
  for (const button of layout.buttons) {
    if (button.action === 'close') {
      paintCloseButton(renderingContext, button.hitRect);
    } else if (button.action === 'back-to-menu' || button.action === 'back-to-settings') {
      paintBackButton(renderingContext, button.hitRect);
    }
  }
  // 标题仅首屏菜单显示；二级页面头部只有返回钮 + 关闭 ×
  if (layout.stage === 'menu') {
    renderingContext.save();
    renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
    renderingContext.font = `600 17px ${UI_FONT_STACK}`;
    renderingContext.textAlign = 'left';
    renderingContext.textBaseline = 'middle';
    renderingContext.fillText(MENU_STAGE_TITLE, layout.panelRect.left + 20, layout.panelRect.top + 28);
    renderingContext.restore();
  }

  // 菜单行（首屏）
  for (const button of layout.buttons) {
    if (button.action.startsWith('menu-')) {
      paintMenuRow(renderingContext, button.hitRect, button.label);
    }
  }

  // 皮肤页分节标题（钱包皮质 / 纸币纹样；锚点与命中同源于布局）
  for (const sectionAnchor of layout.skinSectionAnchors) {
    renderingContext.save();
    renderingContext.fillStyle = MUTED_TEXT_COLOR;
    renderingContext.font = `600 14px ${UI_FONT_STACK}`;
    renderingContext.textAlign = 'left';
    renderingContext.textBaseline = 'top';
    renderingContext.fillText(sectionAnchor.title, layout.panelRect.left + 14, sectionAnchor.topY);
    renderingContext.restore();
  }

  // 页面内容（抽屉内）
  switch (layout.stage) {
    case 'gallery':
      paintGalleryPage(renderingContext, layout, pageData.galleryEntries);
      break;
    case 'skins':
      paintSkinsPage(renderingContext, layout, pageData.skins);
      break;
    case 'achievements':
      paintAchievementsPage(renderingContext, layout, pageData.achievements);
      break;
    case 'settings':
      paintSettingsPage(renderingContext, layout, pageData.settings);
      break;
    case 'privacy':
      paintPrivacyPage(renderingContext, layout);
      break;
    case 'menu':
      break;
  }
  renderingContext.restore();
}

/** 抽屉面板路径：仅左侧圆角（右缘贴屏幕） */
function buildLeftRoundedRectPath(
  renderingContext: CanvasRenderingContext2D,
  rect: Rect,
  leftRadius: number,
): void {
  const { left, top, width, height } = rect;
  renderingContext.beginPath();
  renderingContext.moveTo(left + leftRadius, top);
  renderingContext.lineTo(left + width, top);
  renderingContext.lineTo(left + width, top + height);
  renderingContext.lineTo(left + leftRadius, top + height);
  renderingContext.quadraticCurveTo(left, top + height, left, top + height - leftRadius);
  renderingContext.lineTo(left, top + leftRadius);
  renderingContext.quadraticCurveTo(left, top, left + leftRadius, top);
  renderingContext.closePath();
}

function paintCloseButton(renderingContext: CanvasRenderingContext2D, buttonRect: Rect): void {
  renderingContext.save();
  renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
  renderingContext.font = `600 24px ${UI_FONT_STACK}`;
  renderingContext.textAlign = 'center';
  renderingContext.textBaseline = 'middle';
  renderingContext.fillText('×', buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
  renderingContext.restore();
}

/** 返回钮（页面态头部）：‹ 返回（与菜单标题同级 17px，实测反馈：15px 偏小） */
function paintBackButton(renderingContext: CanvasRenderingContext2D, buttonRect: Rect): void {
  renderingContext.save();
  renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
  renderingContext.font = `500 17px ${UI_FONT_STACK}`;
  renderingContext.textAlign = 'left';
  renderingContext.textBaseline = 'middle';
  renderingContext.fillText('‹ 返回', buttonRect.left + 8, buttonRect.top + buttonRect.height / 2);
  renderingContext.restore();
}

/** 菜单行：白卡 + 左标签 + 右箭头（与设置行同一卡片语言） */
function paintMenuRow(renderingContext: CanvasRenderingContext2D, buttonRect: Rect, label: string): void {
  renderingContext.save();
  buildRoundedRectPath(renderingContext, buttonRect, 12);
  renderingContext.fillStyle = CARD_FILL_COLOR;
  renderingContext.fill();
  renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
  renderingContext.font = `500 16px ${UI_FONT_STACK}`;
  renderingContext.textAlign = 'left';
  renderingContext.textBaseline = 'middle';
  renderingContext.fillText(label, buttonRect.left + 16, buttonRect.top + buttonRect.height / 2);
  renderingContext.fillStyle = MUTED_TEXT_COLOR;
  renderingContext.font = `400 16px ${UI_FONT_STACK}`;
  renderingContext.textAlign = 'right';
  renderingContext.fillText('›', buttonRect.left + buttonRect.width - 16, buttonRect.top + buttonRect.height / 2);
  renderingContext.restore();
}

/** 图鉴页：五档面额卡，收集=完整票面色 + 面值，未收集=虚线占位 */
function paintGalleryPage(
  renderingContext: CanvasRenderingContext2D,
  layout: OverlayLayout,
  galleryEntries: GalleryEntry[],
): void {
  const contentTop = layout.panelRect.top + 72;
  const cardGap = 12;
  const cardWidth = (layout.panelRect.width - 32 - cardGap * 4) / 5;
  const cardHeight = cardWidth * 1.5;
  const faceValues: Record<string, string> = {
    'denomination-1': '1', 'denomination-5': '5', 'denomination-10': '10',
    'denomination-50': '50', 'denomination-100': '100',
  };
  galleryEntries.forEach((entry, entryIndex) => {
    const cardRect: Rect = {
      left: layout.panelRect.left + 16 + entryIndex * (cardWidth + cardGap),
      top: contentTop,
      width: cardWidth,
      height: cardHeight,
    };
    if (entry.collected) {
      const denominationColors = getDenominationColors(entry.denominationId);
      buildRoundedRectPath(renderingContext, cardRect, 10);
      renderingContext.fillStyle = denominationColors.baseColorHex;
      renderingContext.fill();
      renderingContext.strokeStyle = denominationColors.inkColorHex;
      renderingContext.lineWidth = 2;
      renderingContext.stroke();
      renderingContext.fillStyle = denominationColors.inkColorHex;
      renderingContext.font = `700 ${Math.round(cardWidth * 0.34)}px ${UI_FONT_STACK}`;
      renderingContext.textAlign = 'center';
      renderingContext.textBaseline = 'middle';
      renderingContext.fillText(faceValues[entry.denominationId] ?? '?', cardRect.left + cardWidth / 2, cardRect.top + cardHeight / 2);
    } else {
      renderingContext.save();
      renderingContext.setLineDash([4, 4]);
      renderingContext.strokeStyle = MUTED_TEXT_COLOR;
      renderingContext.lineWidth = 1.5;
      buildRoundedRectPath(renderingContext, cardRect, 10);
      renderingContext.stroke();
      renderingContext.restore();
      renderingContext.fillStyle = MUTED_TEXT_COLOR;
      renderingContext.font = `600 ${Math.round(cardWidth * 0.4)}px ${UI_FONT_STACK}`;
      renderingContext.textAlign = 'center';
      renderingContext.textBaseline = 'middle';
      renderingContext.fillText('?', cardRect.left + cardWidth / 2, cardRect.top + cardHeight / 2);
    }
  });
}

/** 皮肤页：分两节的卡网格，解锁=色卡+名称（启用描金框），锁定=深色+解锁阈值（不显示累计数） */
function paintSkinsPage(
  renderingContext: CanvasRenderingContext2D,
  layout: OverlayLayout,
  skins: Array<{ definition: SkinDefinition; unlocked: boolean; active: boolean }>,
): void {
  // 分组后按钮顺序（钱包组→纸币组）与皮肤表交错序不对齐，必须按 skinId 配对
  const skinButtonById = new Map(
    layout.buttons
      .filter((button) => button.action === 'select-skin')
      .map((button) => [button.skinId as string, button]),
  );
  for (const skinEntry of skins) {
    const button = skinButtonById.get(skinEntry.definition.id);
    if (!button) continue;
    const cardRect = button.hitRect;
    renderingContext.save();
    buildRoundedRectPath(renderingContext, cardRect, 12);
    renderingContext.fillStyle = skinEntry.unlocked
      ? skinSwatchColor(skinEntry.definition.id)
      : 'rgba(60, 62, 55, 0.16)';
    renderingContext.fill();
    if (skinEntry.active) {
      renderingContext.strokeStyle = '#C89B4B';
      renderingContext.lineWidth = 2.5;
      buildRoundedRectPath(renderingContext, { ...cardRect, left: cardRect.left - 3, top: cardRect.top - 3, width: cardRect.width + 6, height: cardRect.height + 6 }, 14);
      renderingContext.stroke();
    }
    renderingContext.fillStyle = skinEntry.unlocked ? INK_TEXT_COLOR_HEX : MUTED_TEXT_COLOR;
    renderingContext.font = `500 13px ${UI_FONT_STACK}`;
    renderingContext.textAlign = 'center';
    renderingContext.textBaseline = 'bottom';
    renderingContext.fillText(skinEntry.definition.displayName, cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height - 8);
    if (!skinEntry.unlocked) {
      renderingContext.font = `400 11px ${UI_FONT_STACK}`;
      renderingContext.textBaseline = 'top';
      renderingContext.fillText(`抽满 ${skinEntry.definition.unlockAtDrawCount} 张解锁`, cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2 - 8);
    }
    renderingContext.restore();
  }
}

/** 皮肤色卡取色：由真色板派生（钱包=主体色，纸纹=染色目标色），单一事实来源 */
function skinSwatchColor(skinId: string): string {
  if (skinId.startsWith('wallet-')) {
    return resolveWalletLeatherPalette(skinId).bodyColorHex;
  }
  return resolveBillSkinTint(skinId)?.tintHex ?? BILL_PAPER_BASE_COLOR_HEX;
}

/** 成就页：累计型成就列表，达成=墨青，未达成=灰 */
function paintAchievementsPage(
  renderingContext: CanvasRenderingContext2D,
  layout: OverlayLayout,
  achievements: Array<{ definition: AchievementDefinition; achieved: boolean }>,
): void {
  const rowHeight = 46;
  const contentTop = layout.panelRect.top + 72;
  achievements.forEach((achievementEntry, achievementIndex) => {
    const rowY = contentTop + achievementIndex * rowHeight;
    renderingContext.save();
    renderingContext.fillStyle = achievementEntry.achieved ? INK_TEXT_COLOR_HEX : MUTED_TEXT_COLOR;
    renderingContext.font = `${achievementEntry.achieved ? 600 : 400} 16px ${UI_FONT_STACK}`;
    renderingContext.textAlign = 'left';
    renderingContext.textBaseline = 'middle';
    renderingContext.fillText(
      `${achievementEntry.achieved ? '●' : '○'}  ${achievementEntry.definition.displayName}`,
      layout.panelRect.left + 20,
      rowY + rowHeight / 2,
    );
    renderingContext.restore();
  });
}

/** 设置页：开关行（ON/OFF 胶囊）+ 隐私政策入口 */
function paintSettingsPage(
  renderingContext: CanvasRenderingContext2D,
  layout: OverlayLayout,
  settings: PersistedGameSettings,
): void {
  const rows: Array<{ action: string; label: string; on: boolean | null }> = [
    { action: 'toggle-sound', label: '音效', on: settings.soundEnabled },
    { action: 'toggle-bgm', label: '背景音乐', on: settings.bgmEnabled },
    { action: 'toggle-haptics', label: '触觉反馈', on: settings.hapticsEnabled },
    { action: 'open-privacy', label: '隐私政策', on: null },
  ];
  for (const button of layout.buttons) {
    const row = rows.find((rowEntry) => rowEntry.action === button.action);
    if (!row) continue;
    const rect = button.hitRect;
    renderingContext.save();
    buildRoundedRectPath(renderingContext, { ...rect, height: rect.height }, 12);
    renderingContext.fillStyle = CARD_FILL_COLOR;
    renderingContext.fill();
    renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
    renderingContext.font = `500 16px ${UI_FONT_STACK}`;
    renderingContext.textAlign = 'left';
    renderingContext.textBaseline = 'middle';
    renderingContext.fillText(row.label, rect.left + 16, rect.top + rect.height / 2);
    if (row.on !== null) {
      // 开关胶囊
      const pillWidth = 52;
      const pillHeight = 30;
      const pillLeft = rect.left + rect.width - pillWidth - 14;
      const pillTop = rect.top + (rect.height - pillHeight) / 2;
      buildRoundedRectPath(renderingContext, { left: pillLeft, top: pillTop, width: pillWidth, height: pillHeight }, pillHeight / 2);
      renderingContext.fillStyle = row.on ? '#8FA98B' : 'rgba(60, 62, 55, 0.18)';
      renderingContext.fill();
      renderingContext.beginPath();
      renderingContext.arc(
        pillLeft + (row.on ? pillWidth - pillHeight / 2 : pillHeight / 2),
        pillTop + pillHeight / 2,
        pillHeight / 2 - 3,
        0,
        Math.PI * 2,
      );
      renderingContext.fillStyle = '#FFFFFF';
      renderingContext.fill();
    } else {
      renderingContext.fillStyle = MUTED_TEXT_COLOR;
      renderingContext.font = `400 16px ${UI_FONT_STACK}`;
      renderingContext.textAlign = 'right';
      renderingContext.fillText('›', rect.left + rect.width - 16, rect.top + rect.height / 2);
    }
    renderingContext.restore();
  }
  // 版本信息（规格：设置页含版本）
  renderingContext.save();
  renderingContext.fillStyle = MUTED_TEXT_COLOR;
  renderingContext.font = `400 12px ${UI_FONT_STACK}`;
  renderingContext.textAlign = 'center';
  renderingContext.textBaseline = 'bottom';
  renderingContext.fillText('money-lai · 0.1.0', layout.panelRect.left + layout.panelRect.width / 2, layout.panelRect.top + layout.panelRect.height - 12);
  renderingContext.restore();
}

/** 隐私政策页：静态文案（避开头部行；按抽屉内容宽逐字折行——实测反馈：整句溢出屏幕边缘） */
function paintPrivacyPage(renderingContext: CanvasRenderingContext2D, layout: OverlayLayout): void {
  renderingContext.save();
  renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
  renderingContext.textAlign = 'left';
  renderingContext.textBaseline = 'top';
  const textLeft = layout.panelRect.left + 22;
  const contentWidth = layout.panelRect.width - 22 - 16;
  let lineY = layout.panelRect.top + 76;
  PRIVACY_POLICY_TEXT_LINES.forEach((sourceLine, sourceIndex) => {
    const isTitleLine = sourceIndex === 0;
    renderingContext.font = isTitleLine
      ? `600 18px ${UI_FONT_STACK}`
      : `400 14px ${UI_FONT_STACK}`;
    for (const wrappedLine of wrapTextToWidth(renderingContext, sourceLine, contentWidth)) {
      renderingContext.fillText(wrappedLine, textLeft, lineY);
      lineY += isTitleLine ? 30 : 26;
    }
  });
  renderingContext.restore();
}

/** 按像素宽度贪心折行：中文无空格分词，逐字测量最稳 */
function wrapTextToWidth(
  renderingContext: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0 || text.length === 0) return [text];
  const wrappedLines: string[] = [];
  let currentLine = '';
  for (const character of text) {
    if (
      currentLine.length > 0 &&
      renderingContext.measureText(currentLine + character).width > maxWidth
    ) {
      wrappedLines.push(currentLine);
      currentLine = character;
    } else {
      currentLine += character;
    }
  }
  wrappedLines.push(currentLine);
  return wrappedLines;
}

/** 非侵入轻提示（7.3）：浮动文字，自动淡出、不阻断任何交互 */
export interface FloatingToastView {
  text: string;
  startedAtMs: number;
}

export const TOAST_TOTAL_DURATION_MS = 2500;

/**
 * 轻提示绘制：锚点为「最新一条的顶部」，多条向上堆叠（hints-above-odometer，
 * 调用方把锚点放在金额里程表正上方，后到的提示贴近里程表、早到的向上排）。
 */
export function paintFloatingToasts(
  renderingContext: CanvasRenderingContext2D,
  toasts: FloatingToastView[],
  currentMs: number,
  topY: number,
  viewportWidth: number,
): void {
  renderingContext.save();
  renderingContext.textAlign = 'center';
  renderingContext.textBaseline = 'top';
  renderingContext.font = `500 15px ${UI_FONT_STACK}`;
  toasts.forEach((toast, toastIndex) => {
    const ageMs = currentMs - toast.startedAtMs;
    if (ageMs < 0 || ageMs > TOAST_TOTAL_DURATION_MS) return;
    const fadeIn = Math.min(1, ageMs / 150);
    const fadeOut = Math.min(1, (TOAST_TOTAL_DURATION_MS - ageMs) / 550);
    renderingContext.globalAlpha = Math.min(fadeIn, fadeOut) * 0.9;
    renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
    renderingContext.fillText(toast.text, viewportWidth / 2, topY - toastIndex * 26);
  });
  renderingContext.restore();
}
