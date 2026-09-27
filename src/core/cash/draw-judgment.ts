import { Point2D, Rect, clampToUnitInterval } from '../wallet/flap-hit-test';

/**
 * 抽钞会话判定（cash-drawing 规格 R2/R3/R4/R5 的纯逻辑核心）：
 * 拖出比例跟手累计、35% 完成阈值、回收不计计数、宽容抓取热区。
 * 纸币的弹簧跟随与飘落动画由渲染/物理层消费本状态机输出。
 */

/** 纸币逻辑高度（逻辑像素）：抽出距离按此归一化为比例 */
export const CASH_BILL_LOGICAL_HEIGHT = 20;

/** 完成阈值：抽出比例 ≥ 0.35 判定本张完成（规格 R3；曾临时 0.1，按规格与 design 意图回正） */
export const CASH_DRAW_COMPLETE_THRESHOLD = 0.35;

/** 抽钞意图判定的手势容差（逻辑像素）：未达此值不开始抓取 */
export const CASH_DRAW_GESTURE_SLOP_DISTANCE = 2;

/** 拖拽跟手增益：1=完全跟手；0.75=更粘（daytime-comfort-baseline 实测反馈：柔性延迟略增更舒适） */
export const CASH_DRAW_DRAG_GAIN = 0.75;

/** 抓取热区宽容余量（逻辑像素）：未精确按住纸币也可抓取（规格 R5） */
export const CASH_GRAB_MARGIN_PIXELS = 18;

/** 抽钞运动剖面：跟手增益按会话注入（日间/晚安两套，sleep-mode 规格「夜间交互剖面」） */
export interface CashDrawMotionProfile {
  /** 拖拽位移→抽出比例的增益：1=完全跟手；<1=更粘（同样手指行程抽出更慢） */
  dragGain: number;
}

/** 日间剖面：0.75 跟手增益（daytime-comfort：与晚安一致的「更粘」手感） */
export const DAYTIME_CASH_DRAW_MOTION_PROFILE: CashDrawMotionProfile = { dragGain: 0.75 };

/** 晚安剖面：0.75 增益——柔性延迟略增的「更粘」跟手 */
export const BEDTIME_CASH_DRAW_MOTION_PROFILE: CashDrawMotionProfile = { dragGain: 0.75 };

export type CashDrawPhase = 'idle' | 'dragging' | 'completing' | 'recycling';

export interface CashDrawState {
  phase: CashDrawPhase;
  /** 本张纸币已抽出钱包口的比例 0~1 */
  pulledOutRatio: number;
}

export type CashDrawEvent =
  | { type: 'grab' }
  | { type: 'drag'; dragDeltaY: number }
  | { type: 'release' }
  | { type: 'animation-finished' };

export type CashDrawEffectType =
  /** 本张纸币完成抽出（计入金额与张数） */
  | 'bill-draw-completed'
  /** follow-through 飘落动画开始（渲染层消费） */
  | 'bill-follow-through-began'
  /** 回弹收回动画开始（渲染层消费） */
  | 'bill-recycle-began';

export interface CashDrawEffect {
  type: CashDrawEffectType;
}

export interface CashDrawStateUpdate {
  state: CashDrawState;
  effects: CashDrawEffect[];
}

export function createInitialCashDrawState(): CashDrawState {
  return {
    phase: 'idle',
    pulledOutRatio: 0,
  };
}

export function advanceCashDrawSession(
  state: CashDrawState,
  event: CashDrawEvent,
  motionProfile: CashDrawMotionProfile = DAYTIME_CASH_DRAW_MOTION_PROFILE,
): CashDrawStateUpdate {
  switch (event.type) {
    case 'grab': {
      // 完成动画中再次抓取：在途纸币已过完成阈值，立即结算（计入金额与张数并飘走），
      // 随后开新一张会话——连续快速抽钞不丢计数（rapid-draw-settlement）
      if (state.phase === 'completing') {
        return {
          state: { phase: 'dragging', pulledOutRatio: 0 },
          effects: [{ type: 'bill-draw-completed' }],
        };
      }
      // 回收动画中抓取 = 放弃本张（未过阈值本就不计数），idle/dragging 抓取为普通重置
      return {
        state: { phase: 'dragging', pulledOutRatio: 0 },
        effects: [],
      };
    }

    case 'drag': {
      if (state.phase !== 'dragging') {
        return { state, effects: [] };
      }
      const ratioDelta = (event.dragDeltaY / CASH_BILL_LOGICAL_HEIGHT) * motionProfile.dragGain;
      const nextRatio = clampToUnitInterval(state.pulledOutRatio + ratioDelta);
      return {
        state: {
          ...state,
          pulledOutRatio: nextRatio,
        },
        effects: [],
      };
    }

    case 'release': {
      if (state.phase !== 'dragging') {
        return { state, effects: [] };
      }
      if (state.pulledOutRatio === 0) {
        return { state: createInitialCashDrawState(), effects: [] };
      }
      const completes = state.pulledOutRatio >= CASH_DRAW_COMPLETE_THRESHOLD;
      return completes
        ? {
            state: { ...state, phase: 'completing' },
            effects: [{ type: 'bill-follow-through-began' }],
          }
        : {
            state: { ...state, phase: 'recycling' },
            effects: [{ type: 'bill-recycle-began' }],
          };
    }

    case 'animation-finished': {
      if (state.phase === 'completing') {
        return {
          state: createInitialCashDrawState(),
          effects: [{ type: 'bill-draw-completed' }],
        };
      }
      if (state.phase === 'recycling') {
        // 回收路径不计入计数（规格：未过阈值松手）
        return { state: createInitialCashDrawState(), effects: [] };
      }
      return { state, effects: [] };
    }
  }
}

/** 宽容抓取热区：钱包口矩形四向外扩余量（规格 R5） */
export function isPointInsideCashGrabArea(point: Point2D, walletMouthRect: Rect): boolean {
  const grabAreaLeft = walletMouthRect.left - CASH_GRAB_MARGIN_PIXELS;
  const grabAreaTop = walletMouthRect.top - CASH_GRAB_MARGIN_PIXELS;
  const grabAreaRight = walletMouthRect.left + walletMouthRect.width + CASH_GRAB_MARGIN_PIXELS;
  const grabAreaBottom = walletMouthRect.top + walletMouthRect.height + CASH_GRAB_MARGIN_PIXELS;
  return (
    point.x >= grabAreaLeft &&
    point.x <= grabAreaRight &&
    point.y >= grabAreaTop &&
    point.y <= grabAreaBottom
  );
}
