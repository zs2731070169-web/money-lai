import { THEME_NAMES } from '../content/copy';

/** 信的主题：信封 + 信纸 + 背景成套出现，一套对应 assets/topic/&lt;id&gt;/ 目录。 */
export interface LetterThemeDefinition {
  /** 主题 id，同时是资产目录名（assets/topic/&lt;id&gt;/）。 */
  id: string;
  /** 菜单与选择页显示名（文案集中在 content/copy，核心文件不散落中文）。 */
  name: string;
  /** 解锁所需明信片里程；当前单主题恒 0，多主题后按需设置。 */
  unlockMileage: number;
}

export const DEFAULT_LETTER_THEME_ID = 'topic1';

export const LETTER_THEMES: readonly LetterThemeDefinition[] = [
  { id: 'topic1', name: THEME_NAMES.topic1, unlockMileage: 0 },
] as const;

export function letterThemeById(themeId: string): LetterThemeDefinition {
  return LETTER_THEMES.find((theme) => theme.id === themeId) ?? LETTER_THEMES[0];
}

/** 主题解锁判定：里程达到门槛即可选用；未知主题视为未解锁。 */
export function isLetterThemeUnlocked(themeId: string, mileage: number): boolean {
  const definition = LETTER_THEMES.find((theme) => theme.id === themeId);
  return definition !== undefined && mileage >= definition.unlockMileage;
}
