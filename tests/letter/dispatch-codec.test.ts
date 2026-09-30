import { describe, expect, it } from 'vitest';
import {
  buildDispatchLink, decodeDispatchPayload, encodeDispatchPayload, extractDispatchPayload,
} from '../../src/core/letter/dispatch-codec';

describe('拆信链接 fragment 编解码', () => {
  it('往返一致：中文/换行/表情/空字符串', () => {
    const cases = [
      { text: '一句话', date: '2026-09-30', themeId: 'linglan' },
      { text: '第一行\n第二行\n\n第四行', date: '2026-10-01', themeId: 'linglan' },
      { text: 'emoji 😀🎉 and English mixed', date: '2026-09-30', themeId: 'linglan' },
      { text: '', date: '2026-09-30', themeId: 'linglan' },
      { text: 'a'.repeat(400), date: '2026-09-30', themeId: 'linglan' },
    ];
    for (const payload of cases) {
      const encoded = encodeDispatchPayload(payload);
      expect(decodeDispatchPayload(encoded)).toEqual(payload);
    }
  });

  it('URL-safe：不含 + / = ，可直接做 fragment', () => {
    const encoded = encodeDispatchPayload({ text: '各种内容~!@#$%^&*()_+', date: '2026-09-30', themeId: 'linglan' });
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toMatch(/^[\w-]+$/);
  });

  it('损坏容错：无效 Base64 / 非 JSON / 缺字段 / 空串都返回 null', () => {
    expect(decodeDispatchPayload('!!!not-base64!!!')).toBeNull();
    expect(decodeDispatchPayload('YWJjZGVm')).toBeNull(); // valid base64 but not valid JSON payload shape
    expect(decodeDispatchPayload('')).toBeNull();
    expect(extractDispatchPayload('')).toBeNull();
    expect(extractDispatchPayload('#')).toBeNull();
  });

  it('链接构建与提取：baseUrl + #fragment 往返', () => {
    const payload = { text: '你好', date: '2026-09-30', themeId: 'linglan' };
    const link = buildDispatchLink('https://example.test/view', payload);
    expect(link).toContain('#');
    expect(link.startsWith('https://example.test/view#')).toBe(true);
    const extracted = extractDispatchPayload(new URL(link).hash);
    expect(extracted).toEqual(payload);
  });
});
