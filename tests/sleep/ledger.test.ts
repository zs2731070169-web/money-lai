import { describe, expect, it } from 'vitest';
import {
  NightlySleepRecord,
  appendNightlySleepRecord,
  sealBedtimeSession,
  summarizeSleepLedger,
} from '../../src/core/sleep/ledger';
import {
  PersistedGameStateV1,
  createInitialPersistedGameState,
  createInitialSessionProgress,
  parsePersistedGameState,
  serializePersistedGameState,
} from '../../src/core/meta/game-state';

/** 睡眠账本单测（sleep-mode 规格「会话封存/睡眠小账本」，任务 4.1/4.2）。 */

function buildSealedLedgerForThreeNights(): NightlySleepRecord[] {
  let sleepLedger: NightlySleepRecord[] = [];
  const sealInputs = [
    { startedAtMs: 1_000, count: 12, amount: 60, sleepPointMs: 1_000 + 600_000 },
    { startedAtMs: 2_000_000, count: 5, amount: 25, sleepPointMs: null },
    { startedAtMs: 3_000_000, count: 20, amount: 100, sleepPointMs: 3_000_000 + 900_000 },
  ];
  for (const input of sealInputs) {
    const sealResult = sealBedtimeSession({
      startedAtMs: input.startedAtMs,
      sessionProgressAtEntry: createInitialSessionProgress(),
      sessionProgressAtExit: { sessionAmount: input.amount, sessionCount: input.count },
      sleepPointMs: input.sleepPointMs,
      localDateString: '2026-09-27',
    });
    sleepLedger = appendNightlySleepRecord(sleepLedger, sealResult.record);
  }
  return sleepLedger;
}

describe('会话封存纯函数', () => {
  it('封存增量 = 退出时进度 − 进入时快照（进入前的日间累计不并入）', () => {
    const sealResult = sealBedtimeSession({
      startedAtMs: 500,
      sessionProgressAtEntry: { sessionAmount: 1_000, sessionCount: 40 },
      sessionProgressAtExit: { sessionAmount: 1_060, sessionCount: 52 },
      sleepPointMs: 500 + 150_000,
      localDateString: '2026-09-27',
    });
    expect(sealResult.record.drawnBillCount).toBe(12);
    expect(sealResult.record.drawnAmount).toBe(60);
    expect(sealResult.record.sleepPointMs).toBe(500 + 150_000);
  });

  it('熄灭封存触发早安卡；主动退出（入睡点 null）不触发', () => {
    const sealed = sealBedtimeSession({
      startedAtMs: 1,
      sessionProgressAtEntry: createInitialSessionProgress(),
      sessionProgressAtExit: { sessionAmount: 10, sessionCount: 2 },
      sleepPointMs: 61_000,
      localDateString: '2026-09-27',
    });
    const exited = sealBedtimeSession({
      startedAtMs: 1,
      sessionProgressAtEntry: createInitialSessionProgress(),
      sessionProgressAtExit: { sessionAmount: 10, sessionCount: 2 },
      sleepPointMs: null,
      localDateString: '2026-09-27',
    });
    expect(sealed.morningCardPending).toBe(true);
    expect(exited.morningCardPending).toBe(false);
  });

  it('记录标识确定性派生（同输入同 id，早安卡去重键稳定）', () => {
    const input = {
      startedAtMs: 42,
      sessionProgressAtEntry: createInitialSessionProgress(),
      sessionProgressAtExit: { sessionAmount: 7, sessionCount: 3 } as const,
      sleepPointMs: 100_042,
      localDateString: '2026-09-27',
    };
    expect(sealBedtimeSession(input).record.recordId).toBe(
      sealBedtimeSession(input).record.recordId,
    );
  });

  it('账本汇总：总夜数与累计张数/金额', () => {
    const summary = summarizeSleepLedger(buildSealedLedgerForThreeNights());
    expect(summary.totalNights).toBe(3);
    expect(summary.totalDrawnBillCount).toBe(37);
    expect(summary.totalDrawnAmount).toBe(185);
  });
});

describe('持久化 round-trip 与字段级容错', () => {
  it('初始态 round-trip：账本空、晚安开关默认开启（bedtime-default-on）', () => {
    const initial = createInitialPersistedGameState();
    const parsed = parsePersistedGameState(serializePersistedGameState(initial));
    expect(parsed.resetToInitial).toBe(false);
    expect(parsed.state.sleepLedger).toEqual([]);
    expect(parsed.state.pendingMorningCardRecordId).toBeNull();
    expect(parsed.state.settings.bedtimeModeEnabled).toBe(true);
  });

  it('账本与开关 round-trip：记录完整保留、早安卡待呈现标记保留', () => {
    const state = createInitialPersistedGameState();
    const sleepLedger = buildSealedLedgerForThreeNights();
    state.sleepLedger = sleepLedger;
    state.pendingMorningCardRecordId = sleepLedger[2].recordId;
    state.settings.bedtimeModeEnabled = true;
    state.lifetimeDrawCount = 123;
    const parsed = parsePersistedGameState(serializePersistedGameState(state));
    expect(parsed.resetToInitial).toBe(false);
    expect(parsed.state.sleepLedger).toEqual(sleepLedger);
    expect(parsed.state.pendingMorningCardRecordId).toBe(sleepLedger[2].recordId);
    expect(parsed.state.settings.bedtimeModeEnabled).toBe(true);
    expect(parsed.state.lifetimeDrawCount).toBe(123);
  });

  it('账本字段损坏仅清账本，其余元进程保留（不连坐、不整体重置）', () => {
    const state = createInitialPersistedGameState();
    state.lifetimeDrawCount = 77;
    state.achievements = ['first-open'];
    const corruptedJson = serializePersistedGameState({
      ...state,
      sleepLedger: 'garbage-not-an-array',
    } as unknown as PersistedGameStateV1);
    const parsed = parsePersistedGameState(corruptedJson);
    expect(parsed.resetToInitial).toBe(false);
    expect(parsed.state.sleepLedger).toEqual([]);
    expect(parsed.state.lifetimeDrawCount).toBe(77);
    expect(parsed.state.achievements).toEqual(['first-open']);
  });

  it('账本单条记录损坏 → 整字段静默重置为空', () => {
    const state = createInitialPersistedGameState();
    const validSeal = sealBedtimeSession({
      startedAtMs: 9,
      sessionProgressAtEntry: createInitialSessionProgress(),
      sessionProgressAtExit: { sessionAmount: 5, sessionCount: 1 },
      sleepPointMs: null,
      localDateString: '2026-09-27',
    });
    const corruptedJson = serializePersistedGameState({
      ...state,
      sleepLedger: [validSeal.record, { recordId: 42, drawnBillCount: 'x' }],
    } as unknown as PersistedGameStateV1);
    const parsed = parsePersistedGameState(corruptedJson);
    expect(parsed.state.sleepLedger).toEqual([]);
  });

  it('早安卡标记损坏归 null；晚安开关非布尔归默认开启（显式 false 不被覆盖）', () => {
    const state = createInitialPersistedGameState();
    const corruptedJson = serializePersistedGameState({
      ...state,
      pendingMorningCardRecordId: 123,
      settings: { ...state.settings, bedtimeModeEnabled: 'yes' },
    } as unknown as PersistedGameStateV1);
    const parsed = parsePersistedGameState(corruptedJson);
    expect(parsed.state.pendingMorningCardRecordId).toBeNull();
    expect(parsed.state.settings.bedtimeModeEnabled).toBe(true);

    // 用户显式关闭过的存档：布尔 false 原样保留，不被默认值覆盖
    const explicitOffJson = serializePersistedGameState({
      ...state,
      settings: { ...state.settings, bedtimeModeEnabled: false },
    });
    expect(parsePersistedGameState(explicitOffJson).state.settings.bedtimeModeEnabled).toBe(
      false,
    );
  });
});
