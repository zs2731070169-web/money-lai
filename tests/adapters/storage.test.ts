import { describe, expect, it } from 'vitest';
import { SerializedStorage } from '../../src/adapters/web';

describe('异步串行存储', () => {
  it('读取失败返回 null，写入失败返回 false', async () => {
    const storage = new SerializedStorage({ get: async () => { throw new Error('unavailable'); }, set: async () => { throw new Error('unavailable'); } });
    await expect(storage.read('key')).resolves.toBeNull();
    await expect(storage.write('key', 'value')).resolves.toBe(false);
  });

  it('即便第一个写入较慢，最终值仍是较新的快照', async () => {
    let releaseFirst: (() => void) | undefined;
    const writes: string[] = [];
    const storage = new SerializedStorage({
      get: async () => null,
      set: async (_key, value) => {
        if (value === 'old') await new Promise<void>((resolve) => { releaseFirst = resolve; });
        writes.push(value);
      },
    });
    const first = storage.write('state', 'old');
    const second = storage.write('state', 'new');
    await Promise.resolve();
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(writes).toEqual(['old', 'new']);
  });
});

