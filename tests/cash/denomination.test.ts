import { describe, expect, it } from 'vitest';
import {
  CASH_DENOMINATIONS,
  allocateDenominationForDrawIndex,
  getCashDenominationById,
} from '../../src/core/cash/denomination';

/**
 * 确定性面额分配单测（任务 3.2 验证入口，对应 cash-drawing 规格「面额体系」）：
 * 种子重放序列一致、权重覆盖全部档位、无真实货币元素。
 */

describe('面额表', () => {
  it('提供至少 5 档虚构面额（lai 币）', () => {
    expect(CASH_DENOMINATIONS.length).toBeGreaterThanOrEqual(5);
    const faceValues = CASH_DENOMINATIONS.map((denomination) => denomination.faceValue);
    expect(new Set(faceValues).size).toBe(CASH_DENOMINATIONS.length);
  });

  it('权重总和为 1（公开于代码的确定性权重）', () => {
    const totalWeight = CASH_DENOMINATIONS.reduce(
      (sum, denomination) => sum + denomination.allocationWeight,
      0,
    );
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  it('按 id 查询面额定义', () => {
    const firstDenomination = CASH_DENOMINATIONS[0];
    expect(getCashDenominationById(firstDenomination.id)?.faceValue).toBe(
      firstDenomination.faceValue,
    );
    expect(getCashDenominationById('nonexistent-id')).toBeUndefined();
  });
});

describe('确定性分配', () => {
  it('相同抽取序号产生相同面额（种子重放一致，规格场景）', () => {
    const firstPass = Array.from({ length: 100 }, (_, index) =>
      allocateDenominationForDrawIndex(index),
    );
    const secondPass = Array.from({ length: 100 }, (_, index) =>
      allocateDenominationForDrawIndex(index),
    );
    expect(secondPass).toEqual(firstPass);
  });

  it('前 200 次抽取覆盖全部面额档位', () => {
    const drawnIds = new Set(
      Array.from({ length: 200 }, (_, index) => allocateDenominationForDrawIndex(index)),
    );
    for (const denomination of CASH_DENOMINATIONS) {
      expect(drawnIds).toContain(denomination.id);
    }
  });

  it('5000 次抽取的档位频率与权重一致（±3% 绝对误差）', () => {
    const drawCount = 5000;
    const frequencyById = new Map<string, number>();
    for (let drawIndex = 0; drawIndex < drawCount; drawIndex += 1) {
      const denominationId = allocateDenominationForDrawIndex(drawIndex);
      frequencyById.set(denominationId, (frequencyById.get(denominationId) ?? 0) + 1);
    }
    for (const denomination of CASH_DENOMINATIONS) {
      const actualFrequency = (frequencyById.get(denomination.id) ?? 0) / drawCount;
      expect(Math.abs(actualFrequency - denomination.allocationWeight)).toBeLessThan(0.03);
    }
  });
});
