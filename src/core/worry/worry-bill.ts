/**
 * 心事钞语义（worry-release 规格「心事钞」+ cash-drawing「面额体系」例外条款）：
 * 面额恒 ¥0、抽出计张不计额、不入图鉴、不消耗确定性面额分配序号。
 * 文本仅存在于会话内存，绝无落盘路径。
 */

import { CASH_DENOMINATIONS } from '../cash/denomination';
import { SessionProgressState } from '../meta/game-state';

/** 心事钞面额（规格：恒为 ¥0——它是心事不是钱） */
export const WORRY_BILL_FACE_VALUE = 0;

/** 心事钞淡出延时（秒）：较普通升腾纸钞多留约半拍（worry-release「最后一个淡去」） */
export const WORRY_BILL_FADE_EXTRA_DELAY_SECONDS = 0.4;

/** 心事文本长度上限（字符，worry-release「心事输入」） */
export const WORRY_TEXT_MAX_LENGTH = 30;

/** 在场的心事钞（已抽出、等待放飞了却的清单；会话内存态） */
export interface WorryBill {
  /** 心事文本（仅会话内存；放飞或冷启动即丢弃） */
  text: string;
}

/** 心事钞抽出完成：会话张数 +1、金额不变（计张不计额） */
export function applyWorryBillCompletion(
  sessionProgress: SessionProgressState,
): SessionProgressState {
  return {
    sessionAmount: sessionProgress.sessionAmount,
    sessionCount: sessionProgress.sessionCount + 1,
  };
}

/** 心事文本合法性：非空、去首尾空白后仍在长度上限内 */
export function isValidWorryText(text: string): boolean {
  const trimmedText = text.trim();
  return trimmedText.length > 0 && trimmedText.length <= WORRY_TEXT_MAX_LENGTH;
}

/** 升腾纸钞规划（worry-release「升腾呈现」）：金额→纸钞张数（视觉化映射） */
export interface AscensionBillPlan {
  /** 普通升腾纸钞张数：按平均面额换算，钳制 [6, 36]（下限保手感、上限保帧预算） */
  scatterBillCount: number;
  /** 心事钞张数（在场清单逐张生成，各自带延时淡出） */
  worryBillCount: number;
}

export function resolveAscensionBillPlan(
  sessionAmount: number,
  worryBills: WorryBill[],
): AscensionBillPlan {
  const averageFaceValue =
    CASH_DENOMINATIONS.reduce((sum, denomination) => sum + denomination.faceValue, 0) /
    CASH_DENOMINATIONS.length;
  const estimatedBillCount = Math.ceil(sessionAmount / Math.max(1, averageFaceValue));
  return {
    scatterBillCount: Math.min(36, Math.max(6, estimatedBillCount)),
    worryBillCount: worryBills.length,
  };
}
