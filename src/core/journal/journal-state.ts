import { DEFAULT_POSTCARD_ID, normalizePostcardId } from '../letter/postcard-catalog';
import { APPEARANCES, evaluateAchievementIds, unlockedAppearanceIds } from '../meta/postcard-progress';
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
  unlockedAppearanceIds: string[];
  activeEnvelopeAppearanceId: string;
  activePaperAppearanceId: string;
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
    unlockedAppearanceIds: ['envelope-kraft', 'paper-plain'],
    activeEnvelopeAppearanceId: 'envelope-kraft',
    activePaperAppearanceId: 'paper-plain',
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
    const appearanceIds = new Set(APPEARANCES.map((appearance) => appearance.id));
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
    const unlocked = stringArray(value.unlockedAppearanceIds, appearanceIds);
    const envelope = typeof value.activeEnvelopeAppearanceId === 'string' && unlocked.includes(value.activeEnvelopeAppearanceId)
      ? value.activeEnvelopeAppearanceId : 'envelope-kraft';
    const paper = typeof value.activePaperAppearanceId === 'string' && unlocked.includes(value.activePaperAppearanceId)
      ? value.activePaperAppearanceId : 'paper-plain';
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
      unlockedAppearanceIds: [...new Set([...unlockedAppearanceIds(mileage), ...unlocked])],
      activeEnvelopeAppearanceId: envelope,
      activePaperAppearanceId: paper,
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
    unlockedAppearanceIds: unlockedAppearanceIds(mileage),
    achievementIds: [...new Set([...state.achievementIds, ...achievements])],
    statCadenceCount: state.statCadenceCount + 1,
  };
}

export function clearJournal(state: LetterBurningPersistedState): LetterBurningPersistedState {
  return { ...state, journalEntries: [], collectedPatternIds: [] };
}

export function activateAppearance(
  state: LetterBurningPersistedState,
  appearanceId: string,
): LetterBurningPersistedState {
  if (!state.unlockedAppearanceIds.includes(appearanceId)) return state;
  const definition = APPEARANCES.find((item) => item.id === appearanceId);
  if (!definition) return state;
  return definition.kind === 'envelope'
    ? { ...state, activeEnvelopeAppearanceId: appearanceId }
    : { ...state, activePaperAppearanceId: appearanceId };
}

export function activateFontPackage(
  state: LetterBurningPersistedState,
  fontPackageId: string,
): LetterBurningPersistedState {
  const definition = fontPackageById(fontPackageId);
  if (definition.id !== fontPackageId) return state;
  return { ...state, activeFontPackageId: definition.id };
}
