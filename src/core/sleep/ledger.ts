/**
 * 睡眠小账本（sleep-mode 规格「会话封存与早安卡 / 睡眠小账本」）：
 * 逐夜记录的模型、封存纯函数与账本汇总——仅追加、不删除，持久化经 v1 可选字段落盘。
 */

import type { SessionProgressState } from '../meta/game-state';

/** 一夜的睡眠账本记录 */
export interface NightlySleepRecord {
  /** 记录标识（确定性派生，早安卡一次性呈现的去重键） */
  recordId: string;
  /** 进入晚安模式的本地日期（ISO yyyy-mm-dd，账本按日展示） */
  localDateString: string;
  /** 进入晚安模式时刻（epoch 毫秒） */
  startedAtMs: number;
  /** 入睡点（熄灭完成时刻，epoch 毫秒）；主动退出封存时为 null */
  sleepPointMs: number | null;
  /** 本夜抽取张数（进入晚安模式后的增量，进入前的日间累计不并入） */
  drawnBillCount: number;
  /** 本夜抽取金额（lai 币） */
  drawnAmount: number;
}

/** 账本累计汇总（账本页展示） */
export interface SleepLedgerSummary {
  /** 总夜数 */
  totalNights: number;
  /** 累计张数 */
  totalDrawnBillCount: number;
  /** 累计金额（lai 币） */
  totalDrawnAmount: number;
}

/** 封存输入：进入/退出时刻的会话进度快照与入睡点 */
export interface BedtimeSessionSealInput {
  /** 进入晚安模式时刻（epoch 毫秒） */
  startedAtMs: number;
  /** 进入时的会话进度快照（里程表延续，封存只计增量） */
  sessionProgressAtEntry: SessionProgressState;
  /** 封存时的会话进度 */
  sessionProgressAtExit: SessionProgressState;
  /** 入睡点（epoch 毫秒）；主动退出封存传 null */
  sleepPointMs: number | null;
  /** 本地日期（ISO yyyy-mm-dd，由调用方从本地时间派生） */
  localDateString: string;
}

/** 封存结果：账本记录 + 是否触发早安卡（仅熄灭封存触发，主动退出不触发） */
export interface BedtimeSessionSealResult {
  record: NightlySleepRecord;
  /** true = 该记录待早安卡呈现（写入 pendingMorningCardRecordId） */
  morningCardPending: boolean;
}

/** 封存一夜的夜间会话（纯函数）：增量 = 退出时进度 − 进入时快照 */
export function sealBedtimeSession(sealInput: BedtimeSessionSealInput): BedtimeSessionSealResult {
  const drawnBillCount = Math.max(
    0,
    sealInput.sessionProgressAtExit.sessionCount - sealInput.sessionProgressAtEntry.sessionCount,
  );
  const drawnAmount = Math.max(
    0,
    sealInput.sessionProgressAtExit.sessionAmount - sealInput.sessionProgressAtEntry.sessionAmount,
  );
  const record: NightlySleepRecord = {
    recordId: `sleep-${sealInput.startedAtMs}-${drawnBillCount}`,
    localDateString: sealInput.localDateString,
    startedAtMs: sealInput.startedAtMs,
    sleepPointMs: sealInput.sleepPointMs,
    drawnBillCount,
    drawnAmount,
  };
  return { record, morningCardPending: sealInput.sleepPointMs !== null };
}

/** 追加一条记录（仅追加、不改既有条目；返回新数组） */
export function appendNightlySleepRecord(
  sleepLedger: NightlySleepRecord[],
  record: NightlySleepRecord,
): NightlySleepRecord[] {
  return [...sleepLedger, record];
}

/** 账本累计汇总 */
export function summarizeSleepLedger(sleepLedger: NightlySleepRecord[]): SleepLedgerSummary {
  return sleepLedger.reduce(
    (summary, record) => ({
      totalNights: summary.totalNights + 1,
      totalDrawnBillCount: summary.totalDrawnBillCount + record.drawnBillCount,
      totalDrawnAmount: summary.totalDrawnAmount + record.drawnAmount,
    }),
    { totalNights: 0, totalDrawnBillCount: 0, totalDrawnAmount: 0 },
  );
}

/** 单条记录结构校验（持久化字段级容错用） */
export function isValidNightlySleepRecord(candidate: unknown): candidate is NightlySleepRecord {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const record = candidate as Record<string, unknown>;
  return (
    typeof record.recordId === 'string' &&
    typeof record.localDateString === 'string' &&
    typeof record.startedAtMs === 'number' &&
    Number.isFinite(record.startedAtMs) &&
    (record.sleepPointMs === null ||
      (typeof record.sleepPointMs === 'number' && Number.isFinite(record.sleepPointMs))) &&
    typeof record.drawnBillCount === 'number' &&
    Number.isFinite(record.drawnBillCount) &&
    record.drawnBillCount >= 0 &&
    typeof record.drawnAmount === 'number' &&
    Number.isFinite(record.drawnAmount) &&
    record.drawnAmount >= 0
  );
}
