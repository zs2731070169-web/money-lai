import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PngMetadata { width: number; height: number; bitDepth: number; colorType: number }

function readPngMetadata(relativePath: string): PngMetadata {
  const bytes = readFileSync(resolve(process.cwd(), relativePath));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

describe('信封本地位图契约', () => {
  it.each([
    'assets/envelop/closed_envelope.png',
    'assets/envelop/open_envelope.png',
  ])('%s 使用 1024×1024 RGBA', (path) => {
    expect(readPngMetadata(path)).toEqual({ width: 1024, height: 1024, bitDepth: 8, colorType: 6 });
  });

  it('信纸使用紧凑竖版 RGBA 画布（完整毛边与角饰）', () => {
    const meta = readPngMetadata('assets/envelop/letter_paper.png');
    expect(meta).toEqual({ width: 515, height: 790, bitDepth: 8, colorType: 6 });
  });

  it('背景保持 1536×1024 不透明 RGB', () => {
    expect(readPngMetadata('assets/envelop/background.png')).toEqual({ width: 1536, height: 1024, bitDepth: 8, colorType: 2 });
  });
});
