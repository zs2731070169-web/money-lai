import { COPY, FONT_PACKAGE_COPY } from '../content/copy';
import type { JournalEntry, LetterBurningPersistedState } from '../journal/journal-state';
import { computeJournalLayout } from '../journal/journal-layout';
import { LETTER_ACHIEVEMENTS } from '../meta/postcard-progress';
import { FONT_PACKAGES, fontStackForPackage } from './letter-font';
import type { SafeAreaInsets } from '../platform';
import type { Rect } from './letter-layout';
import { containsPoint } from './letter-layout';
import type { AppPage, MenuLayout } from './menu-layout';
import { computeMenuLayout } from './menu-layout';
import { LETTER_THEMES } from './letter-theme';
import { paintLetterPaperAsset, paintPaperBackground, paintPaperWriting } from './letter-painter';

const INK = '#495853';
const LETTER_RATIO = 491 / 733;

export function pageBackRect(safe: SafeAreaInsets): Rect {
  return { left: safe.left + 14, top: safe.top + 10, width: 68, height: 48 };
}

export function computePageItemRects(width: number, safe: SafeAreaInsets, count: number): Rect[] {
  const left = safe.left + 24; const itemWidth = width - safe.left - safe.right - 48;
  return Array.from({ length: count }, (_, index) => ({ left, top: safe.top + 92 + index * 58, width: itemWidth, height: 50 }));
}

export function computeFontPackageItemRects(width: number, safe: SafeAreaInsets, count: number): Rect[] {
  const left = safe.left + 24; const itemWidth = width - safe.left - safe.right - 48;
  return Array.from({ length: count }, (_, index) => ({ left, top: safe.top + 92 + index * 84, width: itemWidth, height: 72 }));
}

function title(context: CanvasRenderingContext2D, label: string, width: number, safe: SafeAreaInsets): void {
  context.fillStyle = INK; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = "24px ui-rounded,'PingFang SC',sans-serif"; context.fillText(label, width / 2, safe.top + 38);
  context.textAlign = 'left'; context.font = "20px ui-rounded,'PingFang SC',sans-serif"; context.fillText(COPY.backLabel, safe.left + 19, safe.top + 38);
}

function paintMenu(context: CanvasRenderingContext2D, layout: MenuLayout, slideRatio: number, viewportWidth: number, viewportHeight: number): void {
  const ratio = Math.max(0, Math.min(1, slideRatio));
  context.save();
  // 遮罩随展开比例淡入淡出；面板整体从右缘滑入（ratio=1 时位移为零）
  context.globalAlpha = ratio;
  // 全屏遮罩（面板随后绘制覆盖其上）；调暗/调浅改颜色里的 alpha（0–1），如 .28 更暗、.14 更浅
  context.fillStyle = 'rgba(74,59,47,.2)'; context.fillRect(0, 0, viewportWidth, viewportHeight);
  context.globalAlpha = 1;
  context.translate((1 - ratio) * (viewportWidth - layout.panelRect.left), 0);
  context.shadowColor = 'rgba(65,49,39,.18)'; context.shadowBlur = 26; context.fillStyle = '#F6ECDD'; context.fillRect(layout.panelRect.left, layout.panelRect.top, layout.panelRect.width, layout.panelRect.height); context.shadowColor = 'transparent';
  context.fillStyle = INK; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = "22px ui-rounded,'PingFang SC',sans-serif"; context.fillText('×', layout.closeRect.left + layout.closeRect.width / 2, layout.closeRect.top + layout.closeRect.height / 2);
  context.textAlign = 'left'; context.font = "16px ui-rounded,'PingFang SC',sans-serif";
  for (const row of layout.rows) { context.fillText(row.label, row.rect.left + 4, row.rect.top + row.rect.height / 2); context.strokeStyle = 'rgba(73,88,83,.14)'; context.beginPath(); context.moveTo(row.rect.left, row.rect.top + row.rect.height); context.lineTo(row.rect.left + row.rect.width, row.rect.top + row.rect.height); context.stroke(); }
  context.restore();
}

/** 手帐页底部的「烧掉整本手帐」入口（固定页脚，不随网格滚动）。 */
export function journalClearRect(width: number, height: number, safe: SafeAreaInsets): Rect {
  const entryWidth = 220; const entryHeight = 36;
  return { left: (width - entryWidth) / 2, top: height - safe.bottom - 62, width: entryWidth, height: entryHeight };
}

function containLetter(rect: Rect, padding: number): Rect {
  const availableWidth = Math.max(1, rect.width - padding * 2);
  const availableHeight = Math.max(1, rect.height - padding * 2);
  let height = availableHeight;
  let width = height * LETTER_RATIO;
  if (width > availableWidth) { width = availableWidth; height = width / LETTER_RATIO; }
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}

function paintJournal(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  safe: SafeAreaInsets,
  entries: readonly JournalEntry[],
  scroll: number,
  selectedEntryIndex: number | null,
  fontPackageId: string,
  letterPaper?: CanvasImageSource | null,
): void {
  const layout = computeJournalLayout(width, height, safe, entries.length, scroll); title(context, COPY.journal, width, safe);
  // 网格裁剪在页眉带之下：滚动时缩略图从 banner 下缘滑出，不遮挡标题与左上返回按钮
  const gridClipTop = layout.headerRect.top + layout.headerRect.height;
  context.save(); context.beginPath(); context.rect(0, gridClipTop, width, height - gridClipTop); context.clip();
  for (const cell of layout.cells) {
    const entry = entries[cell.entryIndex];
    const artArea = { ...cell.rect, height: cell.rect.height - 23 };
    context.save(); context.shadowColor = 'rgba(64,49,38,.14)'; context.shadowBlur = 8; context.shadowOffsetY = 3;
    const paperRect = containLetter(artArea, 2);
    paintLetterPaperAsset(context, paperRect, letterPaper); context.restore();
    context.fillStyle = INK; context.globalAlpha = 0.7; context.font = "11px ui-rounded,'PingFang SC',sans-serif"; context.textAlign = 'center'; context.fillText(entry.createdAtIso.slice(0, 10), cell.rect.left + cell.rect.width / 2, cell.rect.top + cell.rect.height - 7); context.globalAlpha = 1;
  }
  context.restore();
  context.fillStyle = INK; context.globalAlpha = 0.56; context.textAlign = 'center'; context.font = "12px ui-rounded,'PingFang SC',sans-serif"; context.fillText(COPY.localOnly, width / 2, layout.noteY); context.globalAlpha = 1;
  // 页脚入口：烧掉整本手帐（安静置于本机说明上方，与页面基调一致）
  const clearEntry = journalClearRect(width, height, safe);
  context.fillStyle = INK; context.globalAlpha = entries.length > 0 ? 0.62 : 0.3; context.font = "13px ui-rounded,'PingFang SC',sans-serif";
  context.fillText(COPY.clearJournal, clearEntry.left + clearEntry.width / 2, clearEntry.top + clearEntry.height / 2); context.globalAlpha = 1;
  if (selectedEntryIndex !== null && entries[selectedEntryIndex]) {
    // 点开后放大整封信纸：文字用与书写态相同的换行/字体/混合排版，原格式清楚可读
    const entry = entries[selectedEntryIndex];
    context.fillStyle = 'rgba(65,49,39,.28)'; context.fillRect(0, safe.top + 72, width, height);
    const available = { left: 24, top: safe.top + 116, width: width - 48, height: Math.max(200, height - safe.top - safe.bottom - 176) };
    const paperRect = containLetter(available, 0);
    context.save(); context.shadowColor = 'rgba(65,49,39,.2)'; context.shadowBlur = 22;
    paintLetterPaperAsset(context, paperRect, letterPaper);
    context.restore();
    context.fillStyle = INK; context.globalAlpha = 0.6; context.textAlign = 'center'; context.font = "12px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(entry.createdAtIso.slice(0, 10), width / 2, paperRect.top - 18);
    context.globalAlpha = 1; context.textAlign = 'left';
    if (entry.text) paintPaperWriting(context, paperRect, entry.text, fontPackageId as Parameters<typeof paintPaperWriting>[3]);
  }
}

function paintFontPackages(
  context: CanvasRenderingContext2D,
  width: number,
  safe: SafeAreaInsets,
  activeFontPackageId: string,
): void {
  title(context, COPY.fontPackages, width, safe);
  const rects = computeFontPackageItemRects(width, safe, FONT_PACKAGES.length);
  FONT_PACKAGES.forEach((fontPackage, index) => {
    const row = rects[index];
    const selected = fontPackage.id === activeFontPackageId;
    const packageCopy = FONT_PACKAGE_COPY[fontPackage.copyKey];
    context.fillStyle = INK; context.globalAlpha = selected ? 1 : 0.78; context.textAlign = 'left';
    context.font = "15px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(`${packageCopy.name}${selected ? COPY.fontPackageSelectedSuffix : ''}`, row.left + 18, row.top + 17);
    context.globalAlpha = 0.62; context.font = "12px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(packageCopy.description, row.left + 18, row.top + 37);
    context.globalAlpha = selected ? 0.92 : 0.72; context.fillStyle = INK; context.font = `15px ${fontStackForPackage(fontPackage.id)}`;
    context.fillText(packageCopy.preview, row.left + 18, row.top + 59, row.width - 22);
    if (selected) { context.globalAlpha = 0.7; context.strokeStyle = '#8B7563'; context.lineWidth = 2; context.beginPath(); context.moveTo(row.left + 18, row.top + row.height - 2); context.lineTo(row.left + row.width, row.top + row.height - 2); context.stroke(); }
    context.globalAlpha = 1;
  });
}


/** 主题选择页：一套主题 = 信封 + 信纸 + 背景成套；行样式与字体套餐页一致。 */
function paintThemes(
  context: CanvasRenderingContext2D,
  width: number,
  safe: SafeAreaInsets,
  activeThemeId: string,
  mileage: number,
  letterPaper?: CanvasImageSource | null,
): void {
  title(context, COPY.themes, width, safe);
  const rects = computePageItemRects(width, safe, LETTER_THEMES.length);
  LETTER_THEMES.forEach((theme, index) => {
    const row = rects[index];
    const unlocked = mileage >= theme.unlockMileage;
    const selected = theme.id === activeThemeId;
    const previewRect = containLetter({ left: row.left, top: row.top, width: 58, height: 72 }, 0);
    context.save(); context.globalAlpha = unlocked ? (selected ? 1 : 0.84) : 0.38;
    paintLetterPaperAsset(context, previewRect, letterPaper);
    context.restore();
    context.fillStyle = INK; context.globalAlpha = unlocked ? 1 : 0.55; context.textAlign = 'left';
    context.font = "15px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(`${theme.name}${selected ? COPY.themeSelectedSuffix : ''}`, row.left + 72, row.top + 17);
    context.globalAlpha = 0.62; context.font = "12px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(unlocked ? COPY.themeSetSummary : `${theme.unlockMileage} ${COPY.mileageCompleted}`, row.left + 72, row.top + 37);
    // 选中下划线与文字列对齐（+72，纸面预览图右侧），不延伸到预览图下方
    if (selected) { context.globalAlpha = 0.7; context.strokeStyle = '#8B7563'; context.lineWidth = 2; context.beginPath(); context.moveTo(row.left + 72, row.top + row.height - 2); context.lineTo(row.left + row.width, row.top + row.height - 2); context.stroke(); }
    context.globalAlpha = 1;
  });
}

export interface AppOverlayPaintOptions {
  width: number; height: number; safeArea: SafeAreaInsets; page: Exclude<AppPage, 'main'>;
  state: LetterBurningPersistedState; journalScroll: number; selectedEntryIndex: number | null;
  /** 菜单面板展开比例（0–1）：滑入/滑出动画用；缺省视为 1（全开）。 */
  menuSlideRatio?: number;
  background?: CanvasImageSource | null; backgroundComposed?: CanvasImageSource | null;
  openEnvelope?: CanvasImageSource | null; letterPaper?: CanvasImageSource | null;
}

export function paintAppOverlay(context: CanvasRenderingContext2D, options: AppOverlayPaintOptions): void {
  const { width, height, safeArea, page, state } = options;
  if (page === 'menu') { paintMenu(context, computeMenuLayout(width, height, safeArea), options.menuSlideRatio ?? 1, width, height); return; }
  paintPaperBackground(context, width, height, options.background, options.backgroundComposed);
  if (page === 'journal') { paintJournal(context, width, height, safeArea, state.journalEntries, options.journalScroll, options.selectedEntryIndex, state.activeFontPackageId, options.letterPaper); return; }
  if (page === 'themes') { paintThemes(context, width, safeArea, state.activeThemeId, state.postcardMileage, options.letterPaper); return; }
  if (page === 'font-packages') { paintFontPackages(context, width, safeArea, state.activeFontPackageId); return; }
  if (page === 'mileage') {
    title(context, COPY.mileage, width, safeArea); context.fillStyle = INK; context.textAlign = 'center'; context.font = "64px ui-rounded,'PingFang SC',sans-serif"; context.fillText(String(state.postcardMileage), width / 2, height * 0.46); context.font = "15px ui-rounded,'PingFang SC',sans-serif"; context.globalAlpha = 0.65; context.fillText(COPY.mileageCompleted, width / 2, height * 0.54); context.globalAlpha = 1; return;
  }
  if (page === 'achievements') {
    title(context, COPY.achievements, width, safeArea); const rects = computePageItemRects(width, safeArea, LETTER_ACHIEVEMENTS.length);
    LETTER_ACHIEVEMENTS.forEach((achievement, index) => { const done = state.achievementIds.includes(achievement.id); const rect = rects[index]; context.fillStyle = done ? '#8B7563' : '#B8B0A6'; context.globalAlpha = done ? 1 : 0.55; context.beginPath(); context.arc(rect.left + 18, rect.top + 22, 8, 0, Math.PI * 2); context.fill(); context.fillStyle = INK; context.font = "15px ui-rounded,'PingFang SC',sans-serif"; context.fillText(achievement.name, rect.left + 42, rect.top + 17); context.font = "12px ui-rounded,'PingFang SC',sans-serif"; context.fillText(achievement.description, rect.left + 42, rect.top + 37); context.globalAlpha = 1; }); return;
  }
}

export function hitJournalCell(width: number, height: number, safe: SafeAreaInsets, entryCount: number, scroll: number, x: number, y: number): number | null {
  const layout = computeJournalLayout(width, height, safe, entryCount, scroll);
  // 页眉带（banner/返回按钮区）内不响应格块命中：被裁剪隐藏的格块部分不可点
  if (y < layout.headerRect.top + layout.headerRect.height) return null;
  return layout.cells.find((cell) => containsPoint(cell.rect, x, y))?.entryIndex ?? null;
}
