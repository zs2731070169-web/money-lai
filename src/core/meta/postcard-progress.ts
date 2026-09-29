import { ACHIEVEMENT_COPY } from '../content/copy';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
}

export const LETTER_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first-draw', ...ACHIEVEMENT_COPY['first-draw'] },
  { id: 'first-burn', ...ACHIEVEMENT_COPY['first-burn'] },
  { id: 'first-blank', ...ACHIEVEMENT_COPY['first-blank'] },
  { id: 'mileage-10', ...ACHIEVEMENT_COPY['mileage-10'] },
] as const;

export function evaluateAchievementIds(options: {
  mileage: number;
  completedBlank: boolean;
  drewCard: boolean;
}): string[] {
  const ids: string[] = [];
  if (options.drewCard) ids.push('first-draw');
  if (options.mileage >= 1) ids.push('first-burn');
  if (options.completedBlank) ids.push('first-blank');
  if (options.mileage >= 10) ids.push('mileage-10');
  return ids;
}
