import { CASH_DENOMINATIONS } from '../cash/denomination';
import { PersistedGameStateV1 } from './game-state';

/**
 * 钞票图鉴（meta-progression 规格「钞票图鉴」）：
 * 面额首抽录入、占位/完整两态查询；图鉴数据存于持久化状态。
 */

export interface GalleryEntry {
  denominationId: string;
  /** false = 未收集（占位轮廓） */
  collected: boolean;
  /** 首次抽出的抽取序号（未收集时无意义） */
  firstDrawnAtDrawIndex: number | null;
}

export function recordDenominationFirstDraw(
  state: PersistedGameStateV1,
  denominationId: string,
  drawIndex: number,
): { state: PersistedGameStateV1; isFirstDraw: boolean } {
  if (state.gallery[denominationId] !== undefined) {
    return { state, isFirstDraw: false };
  }
  return {
    state: { ...state, gallery: { ...state.gallery, [denominationId]: drawIndex } },
    isFirstDraw: true,
  };
}

export function getGalleryEntries(state: PersistedGameStateV1): GalleryEntry[] {
  return CASH_DENOMINATIONS.map((denomination) => {
    const firstDrawnAtDrawIndex = state.gallery[denomination.id];
    return {
      denominationId: denomination.id,
      collected: firstDrawnAtDrawIndex !== undefined,
      firstDrawnAtDrawIndex: firstDrawnAtDrawIndex ?? null,
    };
  });
}

export { CASH_DENOMINATIONS };
