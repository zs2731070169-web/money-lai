import { POSTCARD_PATTERNS } from '../letter/patterns';
import { ACHIEVEMENT_COPY, APPEARANCE_NAMES } from '../content/copy';

export type AppearanceKind = 'envelope' | 'paper';
export interface AppearanceDefinition {
  id: string;
  kind: AppearanceKind;
  name: string;
  unlockMileage: number;
  base: string;
  detail: string;
}

export const APPEARANCES: readonly AppearanceDefinition[] = [
  { id: 'envelope-kraft', kind: 'envelope', name: APPEARANCE_NAMES['envelope-kraft'], unlockMileage: 0, base: '#C9A785', detail: '#A87E5D' },
  { id: 'envelope-rose', kind: 'envelope', name: APPEARANCE_NAMES['envelope-rose'], unlockMileage: 3, base: '#C9A3A0', detail: '#98736F' },
  { id: 'envelope-moss', kind: 'envelope', name: APPEARANCE_NAMES['envelope-moss'], unlockMileage: 8, base: '#A8AA94', detail: '#777B68' },
  { id: 'envelope-night', kind: 'envelope', name: APPEARANCE_NAMES['envelope-night'], unlockMileage: 15, base: '#87939A', detail: '#606D76' },
  { id: 'paper-plain', kind: 'paper', name: APPEARANCE_NAMES['paper-plain'], unlockMileage: 0, base: '#EEE0CF', detail: '#CBBBA7' },
  { id: 'paper-fiber', kind: 'paper', name: APPEARANCE_NAMES['paper-fiber'], unlockMileage: 3, base: '#E8D9C6', detail: '#C5B39D' },
  { id: 'paper-sand', kind: 'paper', name: APPEARANCE_NAMES['paper-sand'], unlockMileage: 8, base: '#E4CDAF', detail: '#BE9E7C' },
  { id: 'paper-mist', kind: 'paper', name: APPEARANCE_NAMES['paper-mist'], unlockMileage: 15, base: '#E6E2D7', detail: '#BAB6AC' },
] as const;

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
}

export const LETTER_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first-draw', ...ACHIEVEMENT_COPY['first-draw'] },
  { id: 'first-burn', ...ACHIEVEMENT_COPY['first-burn'] },
  { id: 'first-blank', ...ACHIEVEMENT_COPY['first-blank'] },
  { id: 'patterns-6', ...ACHIEVEMENT_COPY['patterns-6'] },
  { id: 'mileage-10', ...ACHIEVEMENT_COPY['mileage-10'] },
  { id: 'all-patterns', ...ACHIEVEMENT_COPY['all-patterns'] },
] as const;

export function unlockedAppearanceIds(mileage: number): string[] {
  return APPEARANCES.filter((item) => mileage >= item.unlockMileage).map((item) => item.id);
}

export function evaluateAchievementIds(options: {
  mileage: number;
  collectedPatternIds: readonly string[];
  completedBlank: boolean;
  drewCard: boolean;
}): string[] {
  const ids: string[] = [];
  if (options.drewCard) ids.push('first-draw');
  if (options.mileage >= 1) ids.push('first-burn');
  if (options.completedBlank) ids.push('first-blank');
  if (options.collectedPatternIds.length >= 6) ids.push('patterns-6');
  if (options.mileage >= 10) ids.push('mileage-10');
  if (options.collectedPatternIds.length >= POSTCARD_PATTERNS.length) ids.push('all-patterns');
  return ids;
}

export function isAppearanceUnlocked(id: string, mileage: number): boolean {
  const definition = APPEARANCES.find((item) => item.id === id);
  return definition !== undefined && mileage >= definition.unlockMileage;
}
