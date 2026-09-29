import { describe, expect, it } from 'vitest';
import { normalizeMultilineInput } from '../../src/adapters/web';

describe('多行输入归一化', () => {
  it('确认时保留各类换行并限制 Unicode 字符数', () => {
    expect(normalizeMultilineInput('原文\n第二行\r\n末尾', 400)).toBe('原文\n第二行\n末尾');
    expect(normalizeMultilineInput('😀😀😀😀', 3)).toBe('😀😀😀');
    expect(Array.from(normalizeMultilineInput('😀'.repeat(401), 400))).toHaveLength(400);
    expect(normalizeMultilineInput('', 400)).toBe('');
  });
});
