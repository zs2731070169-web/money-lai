import { DEFAULT_POSTCARD_ID, normalizePostcardId } from '../letter/postcard-catalog';
import { evaluateAchievementIds } from '../meta/postcard-progress';
import { DEFAULT_LETTER_THEME_ID, letterThemeById } from '../render/letter-theme';
import { DEFAULT_FONT_PACKAGE_ID, fontPackageById, type FontPackageId } from '../render/letter-font';

export const LETTER_BURNING_STORAGE_KEY = 'letter-burning/state/v1';
export const PRIVACY_CONSENT_STORAGE_KEY = 'letter-burning/privacy-consent/v1';

export interface JournalEntry {
  id: string;
  createdAtIso: string;
  patternId: string;
  text: string;
}

export interface LetterBurningPersistedState {
  version: 1;
  privacyConsent: boolean;
  journalEntries: JournalEntry[];
  postcardMileage: number;
  collectedPatternIds: string[];
  /** 当前启用的信主题（信封+信纸+背景成套）；旧存档无此字段时回落默认主题。 */
  activeThemeId: string;
  activeFontPackageId: FontPackageId;
  achievementIds: string[];
  statCadenceCount: number;
}

export function createEmptyLetterBurningState(): LetterBurningPersistedState {
  return {
    version: 1,
    privacyConsent: false,
    journalEntries: [],
    postcardMileage: 0,
    collectedPatternIds: [],
    activeThemeId: DEFAULT_LETTER_THEME_ID,
    activeFontPackageId: DEFAULT_FONT_PACKAGE_ID,
    achievementIds: [],
    statCadenceCount: 0,
  };
}

function stringArray(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && (!allowed || allowed.has(item))))];
}

export function parseLetterBurningState(serialized: string | null): LetterBurningPersistedState {
  if (!serialized) return createEmptyLetterBurningState();
  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (value.version !== 1) return createEmptyLetterBurningState();
    const entries = Array.isArray(value.journalEntries)
      ? value.journalEntries.flatMap((entry): JournalEntry[] => {
          if (typeof entry !== 'object' || entry === null) return [];
          const candidate = entry as Partial<JournalEntry>;
          const patternId = normalizePostcardId(candidate.patternId);
          return typeof candidate.id === 'string' && typeof candidate.createdAtIso === 'string'
            && patternId !== null && typeof candidate.text === 'string'
            ? [{ id: candidate.id, createdAtIso: candidate.createdAtIso, patternId, text: candidate.text }]
            : [];
        })
      : [];
    const mileage = Number.isSafeInteger(value.postcardMileage) && Number(value.postcardMileage) >= 0
      ? Number(value.postcardMileage) : 0;
    const themeId = letterThemeById(typeof value.activeThemeId === 'string' ? value.activeThemeId : DEFAULT_LETTER_THEME_ID).id;
    const fontPackageId = fontPackageById(typeof value.activeFontPackageId === 'string' ? value.activeFontPackageId : DEFAULT_FONT_PACKAGE_ID).id;
    const collectedPatternIds = [...new Set(
      stringArray(value.collectedPatternIds)
        .map((id) => normalizePostcardId(id))
        .filter((id): id is string => id !== null),
    )];
    return {
      version: 1,
      privacyConsent: value.privacyConsent === true,
      journalEntries: entries,
      postcardMileage: mileage,
      collectedPatternIds,
      activeThemeId: themeId,
      activeFontPackageId: fontPackageId,
      achievementIds: stringArray(value.achievementIds),
      statCadenceCount: Number.isSafeInteger(value.statCadenceCount) && Number(value.statCadenceCount) >= 0
        ? Number(value.statCadenceCount) : 0,
    };
  } catch {
    return createEmptyLetterBurningState();
  }
}

export function serializeLetterBurningState(state: LetterBurningPersistedState): string {
  return JSON.stringify(state);
}

export function settleCompletedPostcard(
  state: LetterBurningPersistedState,
  entry: JournalEntry,
): LetterBurningPersistedState {
  const patternId = normalizePostcardId(entry.patternId) ?? DEFAULT_POSTCARD_ID;
  const normalizedEntry = { ...entry, patternId };
  const collected = state.collectedPatternIds.includes(patternId)
    ? [...state.collectedPatternIds] : [...state.collectedPatternIds, patternId];
  const mileage = state.postcardMileage + 1;
  const achievements = evaluateAchievementIds({
    mileage,
    completedBlank: normalizedEntry.text.length === 0,
    drewCard: true,
  });
  return {
    ...state,
    journalEntries: [...state.journalEntries, normalizedEntry],
    postcardMileage: mileage,
    collectedPatternIds: collected,
    achievementIds: [...new Set([...state.achievementIds, ...achievements])],
    statCadenceCount: state.statCadenceCount + 1,
  };
}

export function clearJournal(state: LetterBurningPersistedState): LetterBurningPersistedState {
  return { ...state, journalEntries: [], collectedPatternIds: [] };
}

export function activateLetterTheme(
  state: LetterBurningPersistedState,
  themeId: string,
  mileage: number,
): LetterBurningPersistedState {
  const definition = letterThemeById(themeId);
  if (definition.id !== themeId || mileage < definition.unlockMileage) return state;
  // 重复点选当前主题：保持原状态对象，避免触发整套资产重载
  if (state.activeThemeId === definition.id) return state;
  return { ...state, activeThemeId: definition.id };
}

export function activateFontPackage(
  state: LetterBurningPersistedState,
  fontPackageId: string,
): LetterBurningPersistedState {
  const definition = fontPackageById(fontPackageId);
  if (definition.id !== fontPackageId) return state;
  return { ...state, activeFontPackageId: definition.id };
}
