import type { SafeAreaInsets } from '../platform';
import type { Rect } from '../render/letter-layout';

export interface JournalCellLayout { entryIndex: number; rect: Rect }
export interface JournalLayout {
  headerRect: Rect;
  backRect: Rect;
  cells: JournalCellLayout[];
  contentHeight: number;
}

/** 手帐页眉带高度（安全区顶部起）：标题/返回/右上入口所在带；网格绘制止于其下缘。 */
const JOURNAL_HEADER_BAND_HEIGHT = 72;

export function computeJournalLayout(
  width: number,
  height: number,
  safeArea: SafeAreaInsets,
  entryCount: number,
  scrollOffset: number,
): JournalLayout {
  const horizontalPadding = 20 + Math.max(safeArea.left, safeArea.right);
  const gap = 12;
  const columns = width < 390 ? 2 : 3;
  const cellWidth = (width - horizontalPadding * 2 - gap * (columns - 1)) / columns;
  const cellHeight = cellWidth * 1.34;
  const headerHeight = JOURNAL_HEADER_BAND_HEIGHT;
  const contentTop = safeArea.top + headerHeight;
  const rowHeight = cellHeight + gap;
  const totalRows = Math.ceil(entryCount / columns);
  const contentHeight = totalRows * rowHeight + 68;
  const firstRow = Math.max(0, Math.floor(scrollOffset / rowHeight) - 1);
  const lastRow = Math.min(totalRows, Math.ceil((scrollOffset + height - contentTop) / rowHeight) + 1);
  const cells: JournalCellLayout[] = [];
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const entryIndex = row * columns + column;
      if (entryIndex >= entryCount) break;
      cells.push({
        entryIndex,
        rect: {
          left: horizontalPadding + column * (cellWidth + gap),
          top: contentTop + row * rowHeight - scrollOffset,
          width: cellWidth,
          height: cellHeight,
        },
      });
    }
  }
  return {
    headerRect: { left: 0, top: safeArea.top, width, height: headerHeight },
    backRect: { left: horizontalPadding - 8, top: safeArea.top + 12, width: 52, height: 44 },
    cells,
    contentHeight,
  };
}

export function maximumJournalScroll(layout: JournalLayout, viewportHeight: number, safeBottom: number): number {
  return Math.max(0, layout.contentHeight - viewportHeight + layout.headerRect.top + layout.headerRect.height + safeBottom);
}
