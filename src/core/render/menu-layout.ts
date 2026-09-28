import type { SafeAreaInsets } from '../platform';
import { COPY } from '../content/copy';
import type { Rect } from './letter-layout';

export type AppPage = 'main' | 'menu' | 'mileage' | 'gallery' | 'appearances' | 'achievements' | 'journal' | 'about';
export type MenuAction = Exclude<AppPage, 'main' | 'menu'> | 'export' | 'help' | 'clear' | 'privacy';
export interface MenuRow { action: MenuAction; label: string; rect: Rect }
export interface MenuLayout { panelRect: Rect; closeRect: Rect; rows: MenuRow[]; disclaimerY: number }

const ITEMS: ReadonlyArray<{ action: MenuAction; label: string }> = [
  { action: 'mileage', label: COPY.mileage }, { action: 'gallery', label: COPY.gallery },
  { action: 'appearances', label: COPY.appearances }, { action: 'achievements', label: COPY.achievements },
  { action: 'journal', label: COPY.journal }, { action: 'export', label: COPY.exportLongImage },
  { action: 'help', label: COPY.youthLine }, { action: 'clear', label: COPY.clearJournal },
  { action: 'about', label: COPY.about }, { action: 'privacy', label: COPY.privacyPolicy },
];

export function computeMenuLayout(width: number, height: number, safe: SafeAreaInsets): MenuLayout {
  const panelWidth = Math.min(342, width - safe.left - safe.right - 28);
  const panelTop = safe.top + 12; const rowHeight = Math.min(47, (height - panelTop - safe.bottom - 96) / ITEMS.length);
  const left = width - safe.right - panelWidth - 14;
  return {
    panelRect: { left, top: panelTop, width: panelWidth, height: height - panelTop - safe.bottom - 14 },
    closeRect: { left: left + panelWidth - 52, top: panelTop + 8, width: 44, height: 44 },
    rows: ITEMS.map((item, index) => ({ ...item, rect: { left: left + 18, top: panelTop + 58 + index * rowHeight, width: panelWidth - 36, height: rowHeight } })),
    disclaimerY: panelTop + 58 + ITEMS.length * rowHeight + 14,
  };
}
