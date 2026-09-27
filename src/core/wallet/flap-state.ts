/**
 * 钱包翻盖状态机（触发语义版，wallet-interaction 规格 v2.1）。
 *
 * 交互模型：滑动=触发信号、不跟手——
 *   按下后在翻盖区定向滑动累计达阈值（28px，上开/下关）即时触发自主折叠；
 *   折叠以缓入缓出曲线从当前进度缓缓完成（开 1.0s / 关 0.9s），无过冲无回弹；
 *   折叠途中反向滑动可从当前进度转向，同向手势与按下被吸收；
 *   轻点与未达阈值的滑动松手均保持原状。
 */

/** 开启判定阈值：开进度 ≥ 此值视为「开启」（纸币抓取路由等消费） */
export const WALLET_FLAP_OPEN_THRESHOLD = 0.55;

/** 折叠触发阈值：定向滑动累计距离（逻辑像素） */
export const WALLET_FLAP_SWIPE_TRIGGER_DISTANCE = 28;

/** 开启折叠时长（ms）：轻抛 → 爬升减速 → 重力荡过 → 阻尼着陆 */
export const WALLET_FLAP_FOLD_OPEN_DURATION_MS = 1680;

/** 关闭折叠时长（ms）：重力下落 → 缓冲垫着陆 */
export const WALLET_FLAP_FOLD_CLOSE_DURATION_MS = 1520;

/** 折叠运动剖面：时长参数按会话注入（日间/晚安两套，sleep-mode 规格「夜间交互剖面」） */
export interface WalletFlapMotionProfile {
  /** 开启折叠时长（ms） */
  foldOpenDurationMs: number;
  /** 关闭折叠时长（ms） */
  foldCloseDurationMs: number;
}

/** 日间剖面：现值保持（wallet-interaction 实测反馈 v2.3） */
export const DAYTIME_WALLET_FLAP_MOTION_PROFILE: WalletFlapMotionProfile = {
  foldOpenDurationMs: WALLET_FLAP_FOLD_OPEN_DURATION_MS,
  foldCloseDurationMs: WALLET_FLAP_FOLD_CLOSE_DURATION_MS,
};

/** 晚安剖面：约 1.6 倍时长（规格区间 1.4-1.8 的中值）——更慢、更重、过冲收敛 */
export const BEDTIME_WALLET_FLAP_MOTION_PROFILE: WalletFlapMotionProfile = {
  foldOpenDurationMs: 1680,
  foldCloseDurationMs: 1520,
};

export type WalletFlapPhase = 'closed' | 'pressing' | 'folding' | 'open';

export interface WalletFlapState {
  /** 当前相位：closed/open=稳定态 pressing=按下累计滑动中 folding=自主折叠中 */
  phase: WalletFlapPhase;
  /** 开合进度 0（全闭）～1（全开）；渲染角度 = 进度 × 全开角 */
  openProgress: number;
  /** folding 目标（0 或 1） */
  foldTarget: 0 | 1;
  /** 折叠起点进度（转向时重置为当前进度） */
  foldStartProgress: number;
  /** 折叠已经过时间（ms） */
  foldElapsedMs: number;
  /** 按下以来的定向累计位移（向上为正；正负自然抵消） */
  swipeAccumulatedPx: number;
  /** 本次折叠是否已发射触面效果（防重复） */
  foldContactEffectEmitted: boolean;
}

export type WalletFlapEvent =
  | { type: 'press' }
  | { type: 'swipe'; deltaY: number }
  | { type: 'release' }
  | { type: 'advance'; deltaMs: number };


/** 效果类型：fold-started=折叠开始（掀起）；fold-contact=关闭触面（轻拍时机） */
export type WalletFlapEffect =
  | { type: 'fold-started'; direction: 'open' | 'close' }
  | { type: 'fold-contact' };

export interface WalletFlapStateUpdate {
  state: WalletFlapState;
  effects: WalletFlapEffect[];
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function easeInCubic(progress: number): number {
  return progress * progress * progress;
}

/**
 * 关闭物理剖面：重力加速下落（0→55%，easeIn）→ 缓冲垫减速（55%→88%，easeOut）
 * → 软接触停住（88%→100%）。无弹跳、不越过终点。
 */
export function walletFlapClosePhysicalProfile(normalizedTime: number): number {
  if (normalizedTime <= 0.55) {
    return 0.5 * easeInCubic(normalizedTime / 0.55);
  }
  if (normalizedTime <= 0.88) {
    return 0.5 + 0.492 * easeOutCubic((normalizedTime - 0.55) / 0.33);
  }
  return 0.992 + 0.008 * easeOutCubic((normalizedTime - 0.88) / 0.12);
}

export function createInitialWalletFlapState(): WalletFlapState {
  return {
    phase: 'closed',
    openProgress: 0,
    foldTarget: 0,
    foldStartProgress: 0,
    foldElapsedMs: 0,
    swipeAccumulatedPx: 0,
    foldContactEffectEmitted: false,
  };
}

/** 由开进度推导稳定相位 */
function settledPhaseForProgress(openProgress: number): 'closed' | 'open' {
  return openProgress >= 0.5 ? 'open' : 'closed';
}

/** 触发一段折叠：从当前进度向目标缓动；携带 fold-started 效果 */
function beginFold(state: WalletFlapState, target: 0 | 1): WalletFlapStateUpdate {
  return {
    state: {
      ...state,
      phase: 'folding',
      foldTarget: target,
      foldStartProgress: state.openProgress,
      foldElapsedMs: 0,
      swipeAccumulatedPx: 0,
      foldContactEffectEmitted: false,
    },
    effects: [{ type: 'fold-started', direction: target === 1 ? 'open' : 'close' }],
  };
}

export function advanceWalletFlap(
  state: WalletFlapState,
  event: WalletFlapEvent,
  motionProfile: WalletFlapMotionProfile = DAYTIME_WALLET_FLAP_MOTION_PROFILE,
): WalletFlapStateUpdate {
  switch (event.type) {
    case 'press': {
      // 折叠期间按下被吸收（规格：不产生新状态）；稳定态按下进入滑动累计
      if (state.phase === 'folding' || state.phase === 'pressing') {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          phase: 'pressing',
          swipeAccumulatedPx: 0,
        },
        effects: [],
      };
    }

    case 'swipe': {
      // pressing：定向累计，达阈值即时触发（无需等松手）
      if (state.phase === 'pressing') {
        const nextState: WalletFlapState = {
          ...state,
          swipeAccumulatedPx: state.swipeAccumulatedPx + event.deltaY,
        };
        if (nextState.swipeAccumulatedPx >= WALLET_FLAP_SWIPE_TRIGGER_DISTANCE) {
          return beginFold(nextState, 1);
        }
        if (nextState.swipeAccumulatedPx <= -WALLET_FLAP_SWIPE_TRIGGER_DISTANCE) {
          // 已是关闭态时下滑触发被吸收（无可折叠目标）
          if (settledPhaseForProgress(nextState.openProgress) === 'closed') {
            return { state: { ...nextState, swipeAccumulatedPx: 0 }, effects: [] };
          }
          return beginFold(nextState, 0);
        }
        return { state: nextState, effects: [] };
      }

      // folding：仅反向滑动可转向（从当前进度平滑转向新目标），同向被吸收
      if (state.phase === 'folding') {
        const reverseAccumulatedPx = state.swipeAccumulatedPx + event.deltaY;
        const reversingTowardClose = state.foldTarget === 1;
        const triggerDistance = reversingTowardClose
          ? -WALLET_FLAP_SWIPE_TRIGGER_DISTANCE
          : WALLET_FLAP_SWIPE_TRIGGER_DISTANCE;
        if (
          ((reversingTowardClose && reverseAccumulatedPx <= triggerDistance) ||
            (!reversingTowardClose && reverseAccumulatedPx >= triggerDistance)) &&
          Math.abs(reverseAccumulatedPx) >= WALLET_FLAP_SWIPE_TRIGGER_DISTANCE
        ) {
          return beginFold(
            { ...state, swipeAccumulatedPx: reverseAccumulatedPx },
            reversingTowardClose ? 0 : 1,
          );
        }
        return { state: { ...state, swipeAccumulatedPx: reverseAccumulatedPx }, effects: [] };
      }

      return { state, effects: [] };
    }

    case 'release': {
      if (state.phase !== 'pressing') {
        return { state, effects: [] };
      }
      // 只有滑动达阈值才触发折叠；轻点和短滑松手均回到稳定态。
      return {
        state: { ...state, phase: settledPhaseForProgress(state.openProgress) },
        effects: [],
      };
    }

    case 'advance': {
      if (state.phase !== 'folding') {
        return { state, effects: [] };
      }
      const foldDurationMs =
        state.foldTarget === 1
          ? motionProfile.foldOpenDurationMs
          : motionProfile.foldCloseDurationMs;
      const foldElapsedMs = state.foldElapsedMs + event.deltaMs;
      const rawProgress = Math.min(1, foldElapsedMs / foldDurationMs);
      // 物理剖面（按方向选择）：开启=抛起/荡过/过冲回落；关闭=重力/垫着陆
      const physicalProfile = walletFlapClosePhysicalProfile(rawProgress);
      const openProgress =
        state.foldStartProgress + (state.foldTarget - state.foldStartProgress) * physicalProfile;

      // 关闭触面效果：进度落到极低（接触钱包面）的瞬间发射一次（轻拍音时机）
      const effects: WalletFlapEffect[] = [];
      let foldContactEffectEmitted = state.foldContactEffectEmitted;
      if (
        state.foldTarget === 0 &&
        !foldContactEffectEmitted &&
        openProgress <= 0.03 &&
        rawProgress > 0.5
      ) {
        foldContactEffectEmitted = true;
        effects.push({ type: 'fold-contact' });
      }

      if (rawProgress >= 1) {
        return {
          state: {
            ...state,
            phase: settledPhaseForProgress(state.foldTarget),
            openProgress: state.foldTarget,
            foldElapsedMs,
            foldContactEffectEmitted,
          },
          effects,
        };
      }
      return {
        state: { ...state, openProgress, foldElapsedMs, foldContactEffectEmitted },
        effects,
      };
    }
  }
}
