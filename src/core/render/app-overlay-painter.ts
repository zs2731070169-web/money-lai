import { COPY, FONT_PACKAGE_COPY, formatAppearanceName, formatAppearanceUnlockMileage } from '../content/copy';
import type { JournalEntry, LetterBurningPersistedState } from '../journal/journal-state';
import { computeJournalLayout } from '../journal/journal-layout';
import { POSTCARD_CATALOG } from '../letter/postcard-catalog';
import { APPEARANCES, LETTER_ACHIEVEMENTS } from '../meta/postcard-progress';
import { FONT_PACKAGES, fontStackForPackage } from './letter-font';
import type { SafeAreaInsets } from '../platform';
import type { Rect } from './letter-layout';
import { containsPoint } from './letter-layout';
import type { AppPage, MenuLayout } from './menu-layout';
import { computeMenuLayout } from './menu-layout';
import { paintEnvelopeAssetPreview, paintLetterPaperAsset, paintPaperBackground } from './letter-painter';

const INK = '#495853';
const LETTER_RATIO = 491 / 733;

export function pageBackRect(safe: SafeAreaInsets): Rect {
  return { left: safe.left + 14, top: safe.top + 10, width: 60, height: 48 };
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
  context.textAlign = 'left'; context.font = "16px ui-rounded,'PingFang SC',sans-serif"; context.fillText(COPY.backLabel, safe.left + 19, safe.top + 38);
}

function paintMenu(context: CanvasRenderingContext2D, layout: MenuLayout): void {
  context.save(); context.fillStyle = 'rgba(74,59,47,.2)'; context.fillRect(0, 0, layout.panelRect.left, layout.panelRect.top + layout.panelRect.height);
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
  letterPaper?: CanvasImageSource | null,
  paperAppearanceId = 'paper-plain',
): void {
  const layout = computeJournalLayout(width, height, safe, entries.length, scroll); title(context, COPY.journal, width, safe);
  for (const cell of layout.cells) {
    const entry = entries[cell.entryIndex];
    const artArea = { ...cell.rect, height: cell.rect.height - 23 };
    context.save(); context.shadowColor = 'rgba(64,49,38,.14)'; context.shadowBlur = 8; context.shadowOffsetY = 3;
    const paperRect = containLetter(artArea, 2);
    paintLetterPaperAsset(context, paperRect, letterPaper, paperAppearanceId); context.restore();
    context.fillStyle = INK; context.globalAlpha = 0.7; context.font = "11px ui-rounded,'PingFang SC',sans-serif"; context.textAlign = 'center'; context.fillText(entry.createdAtIso.slice(0, 10), cell.rect.left + cell.rect.width / 2, cell.rect.top + cell.rect.height - 7); context.globalAlpha = 1;
  }
  context.fillStyle = INK; context.globalAlpha = 0.56; context.textAlign = 'center'; context.font = "12px ui-rounded,'PingFang SC',sans-serif"; context.fillText(COPY.localOnly, width / 2, layout.noteY); context.globalAlpha = 1;
  // 页脚入口：烧掉整本手帐（安静置于本机说明上方，与页面基调一致）
  const clearEntry = journalClearRect(width, height, safe);
  context.fillStyle = INK; context.globalAlpha = entries.length > 0 ? 0.62 : 0.3; context.font = "13px ui-rounded,'PingFang SC',sans-serif";
  context.fillText(COPY.clearJournal, clearEntry.left + clearEntry.width / 2, clearEntry.top + clearEntry.height / 2); context.globalAlpha = 1;
  if (selectedEntryIndex !== null && entries[selectedEntryIndex]) {
    const entry = entries[selectedEntryIndex]; const detail = { left: 28, top: safe.top + 92, width: width - 56, height: Math.min(440, height - safe.top - safe.bottom - 128) };
    context.fillStyle = 'rgba(65,49,39,.28)'; context.fillRect(0, safe.top + 72, width, height);
    context.fillStyle = '#F8F0E4'; context.shadowColor = 'rgba(65,49,39,.2)'; context.shadowBlur = 22; context.fillRect(detail.left, detail.top, detail.width, detail.height); context.shadowColor = 'transparent';
    const paperArea = { left: detail.left + 22, top: detail.top + 18, width: detail.width - 44, height: Math.min(260, detail.height * 0.64) };
    const paperRect = containLetter(paperArea, 0);
    paintLetterPaperAsset(context, paperRect, letterPaper, paperAppearanceId);
    const textTop = paperArea.top + paperArea.height + 14;
    context.fillStyle = INK; context.textAlign = 'left'; context.globalAlpha = 0.7; context.font = "13px ui-rounded,'PingFang SC',sans-serif"; context.fillText(entry.createdAtIso.slice(0, 10), detail.left + 24, textTop);
    if (entry.text) { context.globalAlpha = 0.92; context.font = "16px ui-rounded,'PingFang SC',sans-serif"; context.fillText(entry.text, detail.left + 24, textTop + 34, detail.width - 48); }
    context.globalAlpha = 1;
  }
}

export interface GalleryLayout { cells: Array<{ patternIndex: number; rect: Rect }>; maximumScroll: number }

export function computeGalleryLayout(width: number, height: number, safe: SafeAreaInsets, scroll: number): GalleryLayout {
  const contentTop = safe.top + 96; const viewportBottom = height - safe.bottom - 20;
  const single = POSTCARD_CATALOG.length === 1;
  const columns = single ? 1 : 2; const gap = 18; const padding = single ? 36 : 24;
  const cellWidth = single ? Math.min(230, width - padding * 2) : (width - padding * 2 - gap) / columns;
  const cellHeight = cellWidth * 733 / 491; const rowHeight = cellHeight + 20;
  const rows = Math.ceil(POSTCARD_CATALOG.length / columns);
  const maximumScroll = Math.max(0, rows * rowHeight - (viewportBottom - contentTop));
  const cells = POSTCARD_CATALOG.map((_item, patternIndex) => {
    const column = patternIndex % columns;
    const row = Math.floor(patternIndex / columns);
    const left = single ? (width - cellWidth) / 2 : padding + column * (cellWidth + gap);
    return { patternIndex, rect: { left, top: contentTop + row * rowHeight - Math.min(scroll, maximumScroll), width: cellWidth, height: cellHeight } };
  }).filter((cell) => cell.rect.top + cell.rect.height >= contentTop && cell.rect.top <= viewportBottom);
  return { cells, maximumScroll };
}

function paintGallery(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  safe: SafeAreaInsets,
  state: LetterBurningPersistedState,
  scroll: number,
  letterPaper?: CanvasImageSource | null,
): void {
  title(context, COPY.gallery, width, safe); const layout = computeGalleryLayout(width, height, safe, scroll);
  context.save(); context.beginPath(); context.rect(0, safe.top + 72, width, height - safe.top - safe.bottom - 72); context.clip();
  for (const cell of layout.cells) {
    const item = POSTCARD_CATALOG[cell.patternIndex]; const rect = cell.rect;
    const collected = state.collectedPatternIds.includes(item.id);
    context.save(); context.globalAlpha = collected ? 1 : 0.24;
    paintLetterPaperAsset(context, rect, letterPaper, state.activePaperAppearanceId);
    context.restore();
  }
  context.restore();
}

function paintFontPackages(
  context: CanvasRenderingContext2D,
  width: number,
  safe: SafeAreaInsets,
  activeFontPackageId: string,
  letterPaper?: CanvasImageSource | null,
): void {
  title(context, COPY.fontPackages, width, safe);
  const rects = computeFontPackageItemRects(width, safe, FONT_PACKAGES.length);
  FONT_PACKAGES.forEach((fontPackage, index) => {
    const row = rects[index];
    const selected = fontPackage.id === activeFontPackageId;
    const previewRect = containLetter({ left: row.left, top: row.top, width: 58, height: 72 }, 0);
    context.save();
    context.globalAlpha = selected ? 1 : 0.84;
    paintLetterPaperAsset(context, previewRect, letterPaper, 'paper-plain');
    context.restore();
    const packageCopy = FONT_PACKAGE_COPY[fontPackage.copyKey];
    context.fillStyle = INK; context.globalAlpha = selected ? 1 : 0.78; context.textAlign = 'left';
    context.font = "15px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(`${packageCopy.name}${selected ? COPY.fontPackageSelectedSuffix : ''}`, row.left + 72, row.top + 17);
    context.globalAlpha = 0.62; context.font = "12px ui-rounded,'PingFang SC',sans-serif";
    context.fillText(packageCopy.description, row.left + 72, row.top + 37);
    context.globalAlpha = selected ? 0.92 : 0.72; context.fillStyle = INK; context.font = `15px ${fontStackForPackage(fontPackage.id)}`;
    context.fillText(packageCopy.preview, row.left + 72, row.top + 59, row.width - 76);
    context.globalAlpha = 0.62; context.font = `12px ${fontStackForPackage(fontPackage.id)}`;
    context.fillText(fontPackage.previewEnglish, row.left + 72, row.top + 72, row.width - 76);
    if (selected) { context.globalAlpha = 0.7; context.strokeStyle = '#8B7563'; context.lineWidth = 2; context.beginPath(); context.moveTo(row.left + 72, row.top + row.height - 2); context.lineTo(row.left + row.width, row.top + row.height - 2); context.stroke(); }
    context.globalAlpha = 1;
  });
}

export interface AppOverlayPaintOptions {
  width: number; height: number; safeArea: SafeAreaInsets; page: Exclude<AppPage, 'main'>;
  state: LetterBurningPersistedState; journalScroll: number; galleryScroll: number; selectedEntryIndex: number | null;
  background?: CanvasImageSource | null; backgroundComposed?: CanvasImageSource | null;
  openEnvelope?: CanvasImageSource | null; letterPaper?: CanvasImageSource | null;
}

export function paintAppOverlay(context: CanvasRenderingContext2D, options: AppOverlayPaintOptions): void {
  const { width, height, safeArea, page, state } = options;
  if (page === 'menu') { paintMenu(context, computeMenuLayout(width, height, safeArea)); return; }
  paintPaperBackground(context, width, height, options.background, options.backgroundComposed);
  if (page === 'journal') { paintJournal(context, width, height, safeArea, state.journalEntries, options.journalScroll, options.selectedEntryIndex, options.letterPaper, state.activePaperAppearanceId); return; }
  if (page === 'gallery') { paintGallery(context, width, height, safeArea, state, options.galleryScroll, options.letterPaper); return; }
  if (page === 'font-packages') { paintFontPackages(context, width, safeArea, state.activeFontPackageId, options.letterPaper); return; }
  if (page === 'mileage') {
    title(context, COPY.mileage, width, safeArea); context.fillStyle = INK; context.textAlign = 'center'; context.font = "64px ui-rounded,'PingFang SC',sans-serif"; context.fillText(String(state.postcardMileage), width / 2, height * 0.46); context.font = "15px ui-rounded,'PingFang SC',sans-serif"; context.globalAlpha = 0.65; context.fillText(COPY.mileageCompleted, width / 2, height * 0.54); context.globalAlpha = 1; return;
  }
  if (page === 'appearances') {
    title(context, COPY.appearances, width, safeArea); const rects = computePageItemRects(width, safeArea, APPEARANCES.length);
    APPEARANCES.forEach((appearance, index) => {
      const rect = rects[index]; const unlocked = state.unlockedAppearanceIds.includes(appearance.id);
      const active = state.activeEnvelopeAppearanceId === appearance.id || state.activePaperAppearanceId === appearance.id;
      const previewRect = { left: rect.left, top: rect.top + 2, width: 42, height: 42 };
      context.save(); context.globalAlpha = unlocked ? 1 : 0.38;
      if (appearance.kind === 'envelope') paintEnvelopeAssetPreview(context, previewRect, options.openEnvelope, appearance.id);
      else paintLetterPaperAsset(context, containLetter(previewRect, 0), options.letterPaper, appearance.id);
      context.restore();
      context.fillStyle = INK; context.globalAlpha = unlocked ? 1 : 0.55; context.font = "15px ui-rounded,'PingFang SC',sans-serif"; context.textAlign = 'left';
      context.fillText(formatAppearanceName(appearance.name, active), rect.left + 54, rect.top + 17);
      context.font = "12px ui-rounded,'PingFang SC',sans-serif";
      context.fillText(unlocked ? (appearance.kind === 'envelope' ? COPY.envelopeMaterials : COPY.postcardTextures) : formatAppearanceUnlockMileage(appearance.unlockMileage), rect.left + 54, rect.top + 37); context.globalAlpha = 1;
    }); return;
  }
  if (page === 'achievements') {
    title(context, COPY.achievements, width, safeArea); const rects = computePageItemRects(width, safeArea, LETTER_ACHIEVEMENTS.length);
    LETTER_ACHIEVEMENTS.forEach((achievement, index) => { const done = state.achievementIds.includes(achievement.id); const rect = rects[index]; context.fillStyle = done ? '#8B7563' : '#B8B0A6'; context.globalAlpha = done ? 1 : 0.55; context.beginPath(); context.arc(rect.left + 18, rect.top + 22, 8, 0, Math.PI * 2); context.fill(); context.fillStyle = INK; context.font = "15px ui-rounded,'PingFang SC',sans-serif"; context.fillText(achievement.name, rect.left + 42, rect.top + 17); context.font = "12px ui-rounded,'PingFang SC',sans-serif"; context.fillText(achievement.description, rect.left + 42, rect.top + 37); context.globalAlpha = 1; }); return;
  }
}

export function hitJournalCell(width: number, height: number, safe: SafeAreaInsets, entryCount: number, scroll: number, x: number, y: number): number | null {
  const layout = computeJournalLayout(width, height, safe, entryCount, scroll);
  return layout.cells.find((cell) => containsPoint(cell.rect, x, y))?.entryIndex ?? null;
}
