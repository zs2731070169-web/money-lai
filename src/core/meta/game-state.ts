/**
 * 状态与持久化边界（cash-drawing「抽取进度会话化」+ platform-adaptation「状态持久化契约」）：
 * 会话内存态（金额/张数）MUST NOT 落盘；持久化只承载元进程与解锁用内部累计计数器。
 * sleep-mode 扩展：睡眠账本与晚安模式开关随元进程落盘（v1 可选字段，字段级容错）。
 */

import { NightlySleepRecord, isValidNightlySleepRecord } from '../sleep/ledger';

export const PERSISTED_STATE_STORAGE_KEY = 'money-lai/state/v1';

export interface PersistedGameSettings {
  soundEnabled: boolean;
  bgmEnabled: boolean;
  hapticsEnabled: boolean;
  /** 晚安模式开关（sleep-mode 规格；缺省 false，冷启动保持开关状态） */
  bedtimeModeEnabled?: boolean;
}

export interface PersistedGameStateV1 {
  schemaVersion: 1;
  /** 跨会话内部累计抽取计数器：仅用于皮肤解锁与成就判定，不在界面展示数值 */
  lifetimeDrawCount: number;
  /** 图鉴：面额 id → 首次抽出的序号 */
  gallery: Record<string, number>;
  /** 已解锁皮肤 id 集合 */
  unlockedSkins: string[];
  /** 启用中的钱包皮质（恒有一个启用，默认经典原色；grouped-skin-selection 双槽之一） */
  activeWalletSkin: string;
  /** 启用中的纸币纹样（null = 纸币面额原色；双槽之二，与钱包槽互不覆盖） */
  activeBillSkin: string | null;
  /** 已达成成就 id 集合 */
  achievements: string[];
  settings: PersistedGameSettings;
  /** 睡眠小账本：逐夜记录仅追加（sleep-mode 规格；该字段损坏仅清账本、不连坐其余元进程） */
  sleepLedger?: NightlySleepRecord[];
  /** 早安卡待呈现的封存记录 id（null = 无待呈现；呈现并关闭后清除） */
  pendingMorningCardRecordId?: string | null;
}

/** 会话级抽取进度（冷启动清零，不落盘） */
export interface SessionProgressState {
  sessionAmount: number;
  sessionCount: number;
}

export interface ParsedPersistedState {
  state: PersistedGameStateV1;
  /** true = 输入损坏/不合法，已重置为初始态（降级标记，规格兜底场景） */
  resetToInitial: boolean;
}

/** 默认皮肤 id（皮肤表首项，任务 4.2 引入完整皮肤表） */
export const DEFAULT_SKIN_ID = 'wallet-classic';

export function createInitialPersistedGameState(): PersistedGameStateV1 {
  return {
    schemaVersion: 1,
    lifetimeDrawCount: 0,
    gallery: {},
    unlockedSkins: [DEFAULT_SKIN_ID],
    activeWalletSkin: DEFAULT_SKIN_ID,
    activeBillSkin: null,
    achievements: [],
    // 晚安模式默认开启（bedtime-default-on：产品定位「睡前数钱」，新装即夜间剖面）
    settings: { soundEnabled: true, bgmEnabled: true, hapticsEnabled: true, bedtimeModeEnabled: true },
    sleepLedger: [],
    pendingMorningCardRecordId: null,
  };
}

export function createInitialSessionProgress(): SessionProgressState {
  return { sessionAmount: 0, sessionCount: 0 };
}

export function serializePersistedGameState(state: PersistedGameStateV1): string {
  return JSON.stringify(state);
}

/** 结构校验：公共字段齐全 + 双槽新形态或单槽旧形态（activeSkin）任一成立才接受 */
function isValidPersistedStateCandidate(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const record = candidate as Record<string, unknown>;
  const commonFieldsValid =
    record.schemaVersion === 1 &&
    typeof record.lifetimeDrawCount === 'number' &&
    Number.isFinite(record.lifetimeDrawCount) &&
    typeof record.gallery === 'object' &&
    record.gallery !== null &&
    Array.isArray(record.unlockedSkins) &&
    Array.isArray(record.achievements) &&
    typeof record.settings === 'object' &&
    record.settings !== null &&
    typeof (record.settings as Record<string, unknown>).soundEnabled === 'boolean' &&
    typeof (record.settings as Record<string, unknown>).bgmEnabled === 'boolean' &&
    typeof (record.settings as Record<string, unknown>).hapticsEnabled === 'boolean';
  if (!commonFieldsValid) return false;
  // 新形态：钱包槽字符串 + 纸币槽字符串或 null
  const dualSlotValid =
    typeof record.activeWalletSkin === 'string' &&
    (record.activeBillSkin === null || typeof record.activeBillSkin === 'string');
  // 旧形态：单槽 activeSkin（grouped-skin-selection 之前的存档，解析时迁移）
  const legacySlotValid = typeof record.activeSkin === 'string';
  return dualSlotValid || legacySlotValid;
}

/** 单槽旧档 → 双槽：wallet-* 归钱包槽（纸币槽置空）；bill-* 归纸币槽（钱包槽回经典） */
function migrateLegacyActiveSkin(candidate: Record<string, unknown>): PersistedGameStateV1 {
  const legacyActiveSkin =
    typeof candidate.activeSkin === 'string' ? candidate.activeSkin : DEFAULT_SKIN_ID;
  const migratedState = {
    ...(candidate as unknown as PersistedGameStateV1),
    activeWalletSkin: legacyActiveSkin.startsWith('bill-')
      ? DEFAULT_SKIN_ID
      : legacyActiveSkin,
    activeBillSkin: legacyActiveSkin.startsWith('bill-') ? legacyActiveSkin : null,
  };
  delete (migratedState as Record<string, unknown>).activeSkin;
  return migratedState;
}

/** 睡眠账本字段级容错（sleep-mode 规格：损坏仅清账本、不连坐其余元进程） */
function extractValidSleepLedger(record: Record<string, unknown>): NightlySleepRecord[] {
  const candidateLedger = record.sleepLedger;
  if (!Array.isArray(candidateLedger)) return [];
  // 任一条目结构不合法 → 整字段静默重置为空账本（规格口径）
  const allEntriesValid = candidateLedger.every((entry) => isValidNightlySleepRecord(entry));
  return allEntriesValid ? (candidateLedger as NightlySleepRecord[]) : [];
}

/** 早安卡待呈现标记容错：非字符串一律归 null */
function extractValidPendingMorningCardRecordId(
  record: Record<string, unknown>,
): string | null {
  return typeof record.pendingMorningCardRecordId === 'string'
    ? record.pendingMorningCardRecordId
    : null;
}

export function parsePersistedGameState(rawJson: string | null): ParsedPersistedState {
  if (rawJson === null) {
    return { state: createInitialPersistedGameState(), resetToInitial: false };
  }
  try {
    const parsedCandidate: unknown = JSON.parse(rawJson);
    if (isValidPersistedStateCandidate(parsedCandidate)) {
      const record = parsedCandidate as Record<string, unknown>;
      const migratedState =
        typeof record.activeWalletSkin === 'string'
          ? (record as unknown as PersistedGameStateV1)
          : migrateLegacyActiveSkin(record);
      // sleep-mode 可选字段规范化：缺省补默认值（晚安模式默认开启，bedtime-default-on），
      // 损坏字段静默降级不连坐；用户显式关闭过的存档携带 false，不会被默认值覆盖
      const settingsRecord = migratedState.settings as unknown as Record<string, unknown>;
      const normalizedState: PersistedGameStateV1 = {
        ...migratedState,
        settings: {
          ...migratedState.settings,
          bedtimeModeEnabled:
            typeof settingsRecord.bedtimeModeEnabled === 'boolean'
              ? settingsRecord.bedtimeModeEnabled
              : true,
        },
        sleepLedger: extractValidSleepLedger(record),
        pendingMorningCardRecordId: extractValidPendingMorningCardRecordId(record),
      };
      return { state: normalizedState, resetToInitial: false };
    }
  } catch {
    // JSON 解析失败 → 损坏兜底
  }
  // 损坏/不合法/未知版本：重置为初始态，保留内存运行（规格降级场景）
  return { state: createInitialPersistedGameState(), resetToInitial: true };
}
