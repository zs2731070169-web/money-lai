/**
 * 拆信链接的 fragment 编解码：信内容（正文、日期、主题标记）→ URL-safe Base64。
 * 服务端零知识：内容只在 URL fragment 中流转，浏览器本地解码。
 */

export interface DispatchPayload {
  /** 信件正文（用户手写的原文，含换行）。 */
  text: string;
  /** 寄出日期（ISO 8601 截取到日，如 2026-09-30）。 */
  date: string;
  /** 主题标记（信的主题 id，拆信页据此选资产）。 */
  themeId: string;
}

/** 编码：payload → URL-safe Base64（无 padding，fragment 安全）。 */
export function encodeDispatchPayload(payload: DispatchPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // URL-safe：+ → -，/ → _，去掉 padding =
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 解码：URL-safe Base64 → payload；损坏返回 null（不抛错）。 */
export function decodeDispatchPayload(encoded: string): DispatchPayload | null {
  try {
    // 还原标准 Base64
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Partial<DispatchPayload>;
    if (typeof parsed.text !== 'string' || typeof parsed.date !== 'string' || typeof parsed.themeId !== 'string') return null;
    return { text: parsed.text, date: parsed.date, themeId: parsed.themeId };
  } catch {
    return null;
  }
}

/** 构建完整拆信链接：viewer 基础 URL + #fragment。 */
export function buildDispatchLink(baseUrl: string, payload: DispatchPayload): string {
  return `${baseUrl}#${encodeDispatchPayload(payload)}`;
}

/** 从浏览器 location.hash 提取 payload；无 fragment 或损坏返回 null。 */
export function extractDispatchPayload(hash: string): DispatchPayload | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment) return null;
  return decodeDispatchPayload(fragment);
}
