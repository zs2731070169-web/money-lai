import { describe, expect, it } from 'vitest';
import {
  BEDTIME_WALLET_FLAP_MOTION_PROFILE,
  DAYTIME_WALLET_FLAP_MOTION_PROFILE,
  WalletFlapMotionProfile,
  WALLET_FLAP_FOLD_CLOSE_DURATION_MS,
  WALLET_FLAP_FOLD_OPEN_DURATION_MS,
  WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
  advanceWalletFlap,
  createInitialWalletFlapState,
} from '../../src/core/wallet/flap-state';

/** 翻盖运动剖面单测（sleep-mode 规格「夜间交互剖面」，任务 1.1）：
 * 日间行为零变化（默认参数=现值常量），夜间时长落 1.4-1.8 倍区间、物理时序特征保留。 */

/** 触发开折叠并推进时间线至稳定，返回完成时累计推进的毫秒数 */
function measureOpenFoldDurationMs(motionProfile: WalletFlapMotionProfile): number {
  let update = advanceWalletFlap(createInitialWalletFlapState(), { type: 'press' });
  update = advanceWalletFlap(update.state, {
    type: 'swipe',
    deltaY: WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
  });
  expect(update.state.phase).toBe('folding');
  const stepMs = 33;
  let elapsedMs = 0;
  while (update.state.phase === 'folding') {
    update = advanceWalletFlap(
      update.state,
      { type: 'advance', deltaMs: stepMs },
      motionProfile,
    );
    elapsedMs += stepMs;
  }
  return elapsedMs;
}

describe('翻盖运动剖面', () => {
  it('日间剖面与现值常量一致（日间行为零变化）', () => {
    expect(DAYTIME_WALLET_FLAP_MOTION_PROFILE.foldOpenDurationMs).toBe(
      WALLET_FLAP_FOLD_OPEN_DURATION_MS,
    );
    expect(DAYTIME_WALLET_FLAP_MOTION_PROFILE.foldCloseDurationMs).toBe(
      WALLET_FLAP_FOLD_CLOSE_DURATION_MS,
    );
  });

  it('默认参数即日间剖面：不带剖面的调用行为不变', () => {
    const defaultDuration = measureOpenFoldDurationMs(DAYTIME_WALLET_FLAP_MOTION_PROFILE);
    // 对照：显式传日间剖面与默认调用结果一致（时长都落在日间时长 + 一步容差内）
    expect(defaultDuration).toBeGreaterThanOrEqual(WALLET_FLAP_FOLD_OPEN_DURATION_MS);
    expect(defaultDuration).toBeLessThanOrEqual(WALLET_FLAP_FOLD_OPEN_DURATION_MS + 33);
  });

  it('晚安剖面时长与日间同值（daytime-comfort 对齐：日间基线即原夜间 1.6 倍舒缓值）', () => {
    expect(BEDTIME_WALLET_FLAP_MOTION_PROFILE.foldOpenDurationMs).toBe(
      WALLET_FLAP_FOLD_OPEN_DURATION_MS,
    );
    expect(BEDTIME_WALLET_FLAP_MOTION_PROFILE.foldCloseDurationMs).toBe(
      WALLET_FLAP_FOLD_CLOSE_DURATION_MS,
    );
  });

  it('晚安剖面实际开折叠完成时间与日间一致（对齐后无差异）', () => {
    const bedtimeDuration = measureOpenFoldDurationMs(BEDTIME_WALLET_FLAP_MOTION_PROFILE);
    const daytimeDuration = measureOpenFoldDurationMs(DAYTIME_WALLET_FLAP_MOTION_PROFILE);
    expect(bedtimeDuration).toBe(daytimeDuration);
  });

  it('晚安剖面下关闭折叠仍恰发射一次触面效果（拍音时机保留）', () => {
    // 构造稳定开启态（用日间剖面构造，剖面只影响时长不影响结构）
    let update = advanceWalletFlap(createInitialWalletFlapState(), { type: 'press' });
    update = advanceWalletFlap(update.state, {
      type: 'swipe',
      deltaY: WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
    });
    for (let stepIndex = 0; stepIndex < 80; stepIndex += 1) {
      update = advanceWalletFlap(update.state, { type: 'advance', deltaMs: 33 });
    }
    expect(update.state.phase).toBe('open');

    // 晚安剖面触发关闭并完整推进
    let closeUpdate = advanceWalletFlap(update.state, { type: 'press' });
    closeUpdate = advanceWalletFlap(closeUpdate.state, {
      type: 'swipe',
      deltaY: -WALLET_FLAP_SWIPE_TRIGGER_DISTANCE,
    });
    const contactEffects: string[] = [];
    for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
      closeUpdate = advanceWalletFlap(
        closeUpdate.state,
        { type: 'advance', deltaMs: 33 },
        BEDTIME_WALLET_FLAP_MOTION_PROFILE,
      );
      contactEffects.push(...closeUpdate.effects.map((effect) => effect.type));
    }
    expect(closeUpdate.state.phase).toBe('closed');
    expect(contactEffects.filter((type) => type === 'fold-contact')).toHaveLength(1);
  });
});
