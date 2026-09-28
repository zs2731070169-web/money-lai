import { describe, expect, it } from 'vitest';

/**
 * 工程脚手架冒烟测试（任务 1.1 验证入口）：
 * 证明 TypeScript 编译 + Vitest 执行链路可用。
 */
describe('工程脚手架', () => {
  it('vitest 能执行 TypeScript 测试', () => {
    const roundedCards = [1, 2, 3].reduce((sum, count) => sum + count, 0);
    expect(roundedCards).toBe(6);
  });
});
