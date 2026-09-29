import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_COPY, BACK_PROMPTS, COPY, FLOATING_COPY, POSTCARD_NAMES, formatBurnCount } from '../../src/core/content/copy';

describe('燃信静态文案', () => {
  it('背面引导句严格只有产品定论中的四条', () => {
    expect(BACK_PROMPTS).toEqual(['想说的是……', '今天最难受的是……', '其实一直没说的是……', '如果可以，我想……']);
  });

  it('静态文案不含红线词，统计句只有固定格式', () => {
    const values = [...Object.values(COPY), ...Object.values(POSTCARD_NAMES), ...Object.values(ACHIEVEMENT_COPY).flatMap((item) => [item.name, item.description]), ...BACK_PROMPTS];
    const banned = ['会好的', '诊断', '抑郁', '殡葬', '消灭', '毁掉', '抹去', '烧掉烦恼'];
    for (const text of values) for (const word of banned) expect(text).not.toContain(word);
    expect(formatBurnCount(17)).toBe('17 张信纸已被收好');
    expect(values.filter((text) => text.includes('张信纸已被收好'))).toEqual([COPY.statSuffix]);
  });

  it('浮出文案不超过 12 个汉字，核心其他文件不散落中文字符串', () => {
    for (const text of FLOATING_COPY) expect([...text].filter((character) => /[一-龥]/.test(character)).length).toBeLessThanOrEqual(12);
    for (const file of globSync('src/core/**/*.ts').filter((path) => path !== 'src/core/content/copy.ts')) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(source, file).not.toMatch(/['"`][^'"`\n]*[一-龥][^'"`\n]*['"`]/);
    }
  });
});
