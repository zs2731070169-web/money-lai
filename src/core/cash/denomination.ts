/**
 * 虚构货币「lai 币」面额体系（cash-drawing 规格「面额体系」）：
 * 5 档专属色相面额 + 公开于代码的确定性权重分配（无随机数，种子=抽取序号）。
 */

export interface CashDenominationDefinition {
  /** 面额标识 */
  id: string;
  /** 面值（lai 币） */
  faceValue: number;
  /** 确定性分配权重（0~1，总和为 1） */
  allocationWeight: number;
}

export const CASH_DENOMINATIONS: CashDenominationDefinition[] = [
  { id: 'denomination-1', faceValue: 1, allocationWeight: 0.3 },
  { id: 'denomination-5', faceValue: 5, allocationWeight: 0.3 },
  { id: 'denomination-10', faceValue: 10, allocationWeight: 0.2 },
  { id: 'denomination-50', faceValue: 50, allocationWeight: 0.15 },
  { id: 'denomination-100', faceValue: 100, allocationWeight: 0.05 },
];

/** 黄金比例共轭（无理数）：Weyl 低差异序列的步长，保证确定性与良好分布 */
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

export function getCashDenominationById(
  denominationId: string,
): CashDenominationDefinition | undefined {
  return CASH_DENOMINATIONS.find((denomination) => denomination.id === denominationId);
}

/**
 * 确定性面额分配（规格场景「面额确定性」）：
 * 以抽取序号驱动低差异序列（(n+1)·φ⁻¹ 的小数部分）映射到累积权重区间，
 * 不使用随机数——相同序号重放结果一致，且长程分布收敛于权重。
 */
export function allocateDenominationForDrawIndex(drawIndex: number): string {
  const fractionalPosition = ((drawIndex + 1) * GOLDEN_RATIO_CONJUGATE) % 1;
  let cumulativeWeight = 0;
  for (const denomination of CASH_DENOMINATIONS) {
    cumulativeWeight += denomination.allocationWeight;
    if (fractionalPosition < cumulativeWeight) {
      return denomination.id;
    }
  }
  return CASH_DENOMINATIONS[CASH_DENOMINATIONS.length - 1].id;
}
