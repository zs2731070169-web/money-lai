import { POSTCARD_PATTERNS } from '../letter/patterns';
import { APPEARANCES, evaluateAchievementIds, unlockedAppearanceIds } from '../meta/postcard-progress';

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
    const patternIds = new Set(POSTCARD_PATTERNS.map((pattern) => pattern.id));
    const appearanceIds = new Set(APPEARANCES.map((appearance) => appearance.id));
    const entries = Array.isArray(value.journalEntries)
      ? value.journalEntries.filter((entry): entry is JournalEntry => {
          if (typeof entry !== 'object' || entry === null) return false;
          const candidate = entry as Partial<JournalEntry>;
          return typeof candidate.id === 'string' && typeof candidate.createdAtIso === 'string'
            && typeof candidate.patternId === 'string' && patternIds.has(candidate.patternId)
            && typeof candidate.text === 'string';
        }).map((entry) => ({ ...entry }))
      : [];
    const mileage = Number.isSafeInteger(value.postcardMileage) && Number(value.postcardMileage) >= 0
      ? Number(value.postcardMileage) : 0;
    const unlocked = stringArray(value.unlockedAppearanceIds, appearanceIds);
    const envelope = typeof value.activeEnvelopeAppearanceId === 'string' && unlocked.includes(value.activeEnvelopeAppearanceId)
      ? value.activeEnvelopeAppearanceId : 'envelope-kraft';
    const paper = typeof value.activePaperAppearanceId === 'string' && unlocked.includes(value.activePaperAppearanceId)
      ? value.activePaperAppearanceId : 'paper-plain';
    return {
      version: 1,
      privacyConsent: value.privacyConsent === true,
      journalEntries: entries,
      postcardMileage: mileage,
      collectedPatternIds: stringArray(value.collectedPatternIds, patternIds),
      unlockedAppearanceIds: [...new Set([...unlockedAppearanceIds(mileage), ...unlocked])],
      activeEnvelopeAppearanceId: envelope,
      activePaperAppearanceId: paper,
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
  const collected = state.collectedPatternIds.includes(entry.patternId)
    ? [...state.collectedPatternIds] : [...state.collectedPatternIds, entry.patternId];
  const mileage = state.postcardMileage + 1;
  const achievements = evaluateAchievementIds({
    mileage,
    collectedPatternIds: collected,
    completedBlank: entry.text.length === 0,
    drewCard: true,
  });
  return {
    ...state,
    journalEntries: [...state.journalEntries, { ...entry }],
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
