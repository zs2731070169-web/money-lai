import { describe, expect, it } from 'vitest';
import { LETTER_ACHIEVEMENTS } from '../../src/core/meta/postcard-progress';

describe('燃信成就定义', () => {
  it('不含连续、排名、限时、失败或医疗条件', () => {
    const serialized = JSON.stringify(LETTER_ACHIEVEMENTS);
    for (const banned of ['连续', '排名', '限时', '失败', '诊断']) expect(serialized).not.toContain(banned);
  });
});
