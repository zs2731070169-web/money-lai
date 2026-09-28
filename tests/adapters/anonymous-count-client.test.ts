import { describe, expect, it, vi } from 'vitest';
import { incrementAnonymousBurnCount } from '../../src/adapters/anonymous-count-client';

describe('匿名计数客户端', () => {
  it('只发送无请求体、无凭据、无认证头的 POST', async () => {
    let capturedInit: RequestInit | undefined;
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { capturedInit = init; return new Response(JSON.stringify({ count: 12 }), { status: 200 }); });
    await expect(incrementAnonymousBurnCount('https://count.example/burn', fakeFetch)).resolves.toBe(12);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(capturedInit).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store' });
    expect(capturedInit).not.toHaveProperty('body');
    expect(capturedInit).not.toHaveProperty('headers');
  });

  it('未配置、失败或返回无效计数时静默返回 null', async () => {
    await expect(incrementAnonymousBurnCount(null)).resolves.toBeNull();
    await expect(incrementAnonymousBurnCount('https://count.example/burn', async () => { throw new Error('offline'); })).resolves.toBeNull();
    await expect(incrementAnonymousBurnCount('https://count.example/burn', async () => new Response('{"count":0}'))).resolves.toBeNull();
  });

  it('超过短超时后主动中止并静默返回 null', async () => {
    vi.useFakeTimers();
    try {
      const pending = incrementAnonymousBurnCount('https://count.example/burn', async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }), 25);
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
