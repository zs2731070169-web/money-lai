import { describe, expect, it, vi } from 'vitest';
import { shareNativeTemporaryPng } from '../../src/adapters/web';

describe('iOS 临时 PNG 系统分享', () => {
  for (const scenario of [
    { name: '完成', failure: null, expected: 'shared' },
    { name: '取消', failure: new Error('User cancelled'), expected: 'cancelled' },
    { name: '失败', failure: new Error('unavailable'), expected: 'failed' },
  ] as const) {
    it(`${scenario.name}后都清理临时文件`, async () => {
      const deleteFile = vi.fn(async () => undefined);
      const result = await shareNativeTemporaryPng('journal.png', 'cG5n', '手帐', {
        writeFile: async () => 'file:///cache/journal.png',
        share: async () => { if (scenario.failure) throw scenario.failure; },
        deleteFile,
      });
      expect(result).toBe(scenario.expected); expect(deleteFile).toHaveBeenCalledWith('letter-burning/journal.png');
    });
  }

  it('临时文件写入失败也尝试清理目标路径', async () => {
    const deleteFile = vi.fn(async () => undefined);
    const result = await shareNativeTemporaryPng('journal.png', 'cG5n', '手帐', {
      writeFile: async () => { throw new Error('partial write'); },
      share: async () => undefined,
      deleteFile,
    });
    expect(result).toBe('failed'); expect(deleteFile).toHaveBeenCalledWith('letter-burning/journal.png');
  });
});
