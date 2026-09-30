import type { SafeAreaInsets } from '../platform';
import { COPY } from '../content/copy';
import type { Rect } from './letter-layout';

export type AppPage = 'main' | 'menu' | 'mileage' | 'themes' | 'font-packages' | 'achievements' | 'journal';
export type MenuAction = Exclude<AppPage, 'main' | 'menu'> | 'privacy';
export interface MenuRow { action: MenuAction; label: string; rect: Rect }
export interface MenuLayout { panelRect: Rect; rows: MenuRow[] }

const ITEMS: ReadonlyArray<{ action: MenuAction; label: string }> = [
  { action: 'mileage', label: COPY.mileage }, { action: 'themes', label: COPY.themes },
  { action: 'font-packages', label: COPY.fontPackages }, { action: 'achievements', label: COPY.achievements },
  { action: 'journal', label: COPY.journal }, { action: 'privacy', label: COPY.privacyPolicy },
];

export function computeMenuLayout(width: number, height: number, safe: SafeAreaInsets): MenuLayout {
  // 收窄面板宽度，行内边距与关闭按钮位置随 panelWidth 推导
  const panelWidth = Math.min(170, width - safe.left - safe.right - 28);
  // 面板顶天立地：上下贴住屏幕边缘；×与行内容仍按安全区下锚，避开状态栏与 Home 指示条
  const contentTop = safe.top + 12;
  const rowHeight = Math.min(60, (height - contentTop - safe.bottom - 96) / ITEMS.length);
  // 右缘贴住安全区右边界（iPhone 侧无插边即为屏幕右缘）
  const left = width - safe.right - panelWidth;
  return {
    panelRect: { left, top: 0, width: panelWidth, height },
    rows: ITEMS.map((item, index) => ({ ...item, rect: { left: left + 18, top: contentTop + 58 + index * rowHeight, width: panelWidth - 36, height: rowHeight } })),
  };
}
