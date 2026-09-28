import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worker, { BurnCounter, incrementHourlyBuckets, type DurableState, type HourlyStorage } from '../../worker/src/index';

class MemoryStorage implements HourlyStorage {
  readonly values = new Map<string, number>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async put(key: string, value: number): Promise<void> { this.values.set(key, value); }
  async list<T>(): Promise<Map<string, T>> { return new Map(this.values) as Map<string, T>; }
  async delete(keys: string[]): Promise<void> { for (const key of keys) this.values.delete(key); }
}

describe('24 小时匿名时间桶', () => {
  it('当前小时自增，并排除 24 小时窗口之外的桶', async () => {
    const storage = new MemoryStorage(); storage.values.set('hour:76', 9); storage.values.set('hour:77', 2); storage.values.set('hour:100', 3);
    expect(await incrementHourlyBuckets(storage, 100)).toBe(6);
    expect(storage.values.has('hour:76')).toBe(false);
  });

  it('Durable Object 事务串行保证并发增量不丢失', async () => {
    const memory = new MemoryStorage(); let queue = Promise.resolve();
    const state: DurableState = { storage: Object.assign(memory, { transaction<T>(closure: (storage: HourlyStorage) => Promise<T>): Promise<T> { const result = queue.then(() => closure(memory)); queue = result.then(() => undefined); return result; } }) };
    const counter = new BurnCounter(state); const responses = await Promise.all(Array.from({ length: 20 }, () => counter.fetch(new Request('https://internal/increment', { method: 'POST' }))));
    const counts = await Promise.all(responses.map(async (response) => Number((await response.json() as { count: number }).count)));
    expect(Math.max(...counts)).toBe(20);
  });

  it('只接受 /burn 的空 POST', async () => {
    const namespace = { idFromName: () => 'id', get: () => ({ fetch: async () => Response.json({ count: 1 }) }) };
    expect((await worker.fetch(new Request('https://example.test/burn'), { BURN_COUNTER: namespace })).status).toBe(405);
    expect((await worker.fetch(new Request('https://example.test/other', { method: 'POST' }), { BURN_COUNTER: namespace })).status).toBe(404);
    expect((await worker.fetch(new Request('https://example.test/burn', { method: 'POST', body: 'text' }), { BURN_COUNTER: namespace })).status).toBe(400);
    expect(await (await worker.fetch(new Request('https://example.test/burn', { method: 'POST' }), { BURN_COUNTER: namespace })).json()).toEqual({ count: 1 });
  });

  it('源码与配置无日志、Cookie、User-Agent 和第三方转发', () => {
    const source = readFileSync('worker/src/index.ts', 'utf8'); const config = readFileSync('worker/wrangler.toml', 'utf8');
    expect(source).not.toMatch(/console\s*\./); expect(source).not.toMatch(/cookie/i); expect(source).not.toMatch(/user-agent/i); expect(source).not.toMatch(/https:\/\/(?!counter\.internal)/);
    expect(config).toContain('enabled = false'); expect(config).toContain('send_metrics = false');
  });
});
