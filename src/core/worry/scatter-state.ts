/**
 * 放飞状态机（worry-release 规格「放飞触发与取消」）：
 * 按住里程表 → 数字凝沓跟手（grasped）→ 松手结算——上拖达阈值=放飞（released），
 * 原位/下拖=取消回落（cancelled）。无计时门槛：按下即凝沓、松手即决。
 * 纸沓跟手位移与回落动画为渲染层演出，本状态机只管判定。
 */

/** 上拖放飞阈值（逻辑像素）：松手时高于按下点此距离才触发放飞 */
export const SCATTER_DRAG_UP_RELEASE_THRESHOLD_PX = 40;

export type ScatterPhase = 'idle' | 'grasped' | 'released';

export interface ScatterState {
  /** 当前相位：idle=未发起 grasped=凝沓跟手中 released=已放飞（终态，消费方处理后复位） */
  phase: ScatterPhase;
  /** 纸沓中心相对按下点的纵向偏移（逻辑像素，正=高于按下点；可为负=拖到按下点之下） */
  dragOffsetUpPixels: number;
}

export type ScatterEvent =
  | { type: 'press' }
  | { type: 'drag'; deltaUpPixels: number }
  | { type: 'release' };

export type ScatterOutcome = null | 'scatter-released' | 'scatter-cancelled';

export interface ScatterStateUpdate {
  state: ScatterState;
  /** 松手结算：released=放飞触发（消费方做视觉化与归零）；cancelled=落回取消；null=进行中 */
  outcome: ScatterOutcome;
}

export function createInitialScatterState(): ScatterState {
  return { phase: 'idle', dragOffsetUpPixels: 0 };
}

export function advanceScatterSession(
  state: ScatterState,
  event: ScatterEvent,
): ScatterStateUpdate {
  switch (event.type) {
    case 'press': {
      // grasped 中重复按下被吸收（单指语义由编排层多指防护保证）
      if (state.phase !== 'idle') {
        return { state, outcome: null };
      }
      // 按下即凝沓：无计时门槛（worry-release 规格）
      return { state: { phase: 'grasped', dragOffsetUpPixels: 0 }, outcome: null };
    }
    case 'drag': {
      if (state.phase !== 'grasped') {
        return { state, outcome: null };
      }
      return {
        state: {
          ...state,
          dragOffsetUpPixels: state.dragOffsetUpPixels + event.deltaUpPixels,
        },
        outcome: null,
      };
    }
    case 'release': {
      if (state.phase !== 'grasped') {
        return { state, outcome: null };
      }
      // 高处松手=放飞；原位/拖回松手=取消回落（数字恢复、无状态变化）
      if (state.dragOffsetUpPixels >= SCATTER_DRAG_UP_RELEASE_THRESHOLD_PX) {
        return { state: { phase: 'released', dragOffsetUpPixels: 0 }, outcome: 'scatter-released' };
      }
      return { state: createInitialScatterState(), outcome: 'scatter-cancelled' };
    }
  }
}
