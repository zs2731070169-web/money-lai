import { describe, expect, it } from 'vitest';
import { normalizeSingleLineInput } from '../../src/adapters/web';

describe('单行输入归一化', () => {
  it('确认时把各类换行转为空格并保留其他原文', () => {
    expect(normalizeSingleLineInput('原文\n第二行\r\n末尾')).toBe('原文 第二行 末尾');
    expect(normalizeSingleLineInput('')).toBe('');
  });
});

