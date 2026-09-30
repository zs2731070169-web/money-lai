import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { FONT_PACKAGES } from '../../src/core/render/letter-font';

interface PngMetadata { width: number; height: number; bitDepth: number; colorType: number }

interface RgbaPng extends PngMetadata { pixels: Uint8Array }

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

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function readRgbaPng(relativePath: string): RgbaPng {
  const bytes = readFileSync(resolve(process.cwd(), relativePath));
  const metadata = readPngMetadata(relativePath);
  expect(metadata).toMatchObject({ bitDepth: 8, colorType: 6 });

  const idatChunks: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idatChunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const encoded = inflateSync(Buffer.concat(idatChunks));
  const stride = metadata.width * 4;
  const pixels = new Uint8Array(stride * metadata.height);
  let sourceOffset = 0;
  for (let y = 0; y < metadata.height; y += 1) {
    const filter = encoded[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[sourceOffset + x];
      const target = y * stride + x;
      const left = x >= 4 ? pixels[target - 4] : 0;
      const above = y > 0 ? pixels[target - stride] : 0;
      const upperLeft = x >= 4 && y > 0 ? pixels[target - stride - 4] : 0;
      if (filter === 0) pixels[target] = raw;
      else if (filter === 1) pixels[target] = raw + left;
      else if (filter === 2) pixels[target] = raw + above;
      else if (filter === 3) pixels[target] = raw + Math.floor((left + above) / 2);
      else if (filter === 4) pixels[target] = raw + paeth(left, above, upperLeft);
      else throw new Error(`Unsupported PNG filter: ${filter}`);
    }
    sourceOffset += stride;
  }
  return { ...metadata, pixels };
}

describe('信封本地位图契约', () => {
  it.each([
    'assets/topic/linglan/closed_envelope.png',
    'assets/topic/linglan/open_envelope_back.png',
    'assets/topic/linglan/open_envelope_front.png',
  ])('%s 使用 1024×1024 RGBA', (path) => {
    expect(readPngMetadata(path)).toEqual({ width: 1024, height: 1024, bitDepth: 8, colorType: 6 });
  });

  it('信纸使用紧凑竖版 RGBA 画布（完整毛边与角饰）', () => {
    const meta = readPngMetadata('assets/topic/linglan/letter_paper.png');
    expect(meta).toEqual({ width: 1024, height: 1536, bitDepth: 8, colorType: 6 });
  });

  it('信纸透明轮廓不携带锯齿状白色 matte', () => {
    const { width, height, pixels } = readRgbaPng('assets/topic/linglan/letter_paper.png');
    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];
    let boundaryPixels = 0;
    let nearWhiteBoundaryPixels = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] === 0) continue;
        const touchesTransparency = alphaAt(x - 1, y) === 0
          || alphaAt(x + 1, y) === 0
          || alphaAt(x, y - 1) === 0
          || alphaAt(x, y + 1) === 0;
        if (!touchesTransparency) continue;
        boundaryPixels += 1;
        const averageRgb = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
        if (averageRgb >= 248) nearWhiteBoundaryPixels += 1;
      }
    }

    expect(boundaryPixels).toBeGreaterThan(2_000);
    expect(nearWhiteBoundaryPixels / boundaryPixels).toBeLessThan(0.01);
  });

  it('打开信封前后层在 V 字开口处各自保留正确透明区域', () => {
    const back = readRgbaPng('assets/topic/linglan/open_envelope_back.png');
    const front = readRgbaPng('assets/topic/linglan/open_envelope_front.png');
    const alphaAt = (image: RgbaPng, x: number, y: number) => image.pixels[(y * image.width + x) * 4 + 3];

    // 后片保留上方内衬，但在前袋覆盖的下方完全透明。
    expect(alphaAt(back, 512, 160)).toBeGreaterThan(0);
    expect(alphaAt(back, 512, 900)).toBe(0);
    // 正面保留 V 字两侧和下方前袋，中间开口不应有不透明像素。
    expect(alphaAt(front, 100, 520)).toBeGreaterThan(0);
    expect(alphaAt(front, 924, 520)).toBeGreaterThan(0);
    expect(alphaAt(front, 512, 180)).toBe(0);
    expect(alphaAt(front, 512, 900)).toBeGreaterThan(0);
  });

  it('背景保持 1536×1024 不透明 RGB', () => {
    expect(readPngMetadata('assets/topic/linglan/background.png')).toEqual({ width: 1536, height: 1024, bitDepth: 8, colorType: 2 });
  });

  it('随包霞鹜文楷字体与 OFL 授权文件齐全', () => {
    const font = readFileSync(resolve(process.cwd(), 'assets/fonts/LXGWWenKaiLite-Regular.ttf'));
    expect(font.length).toBeGreaterThan(10_000_000);
    expect(['true', '\u0000\u0001\u0000\u0000']).toContain(font.subarray(0, 4).toString('ascii'));
    const license = readFileSync(resolve(process.cwd(), 'assets/fonts/OFL-LXGWWenKaiLite.txt'), 'utf8');
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(license).toContain('LXGW');
  });

  it('三组字体套餐的字体文件与授权均随包提供', () => {
    const expectedLicenses = ['OFL-LXGWWenKaiLite.txt', 'OFL-Yozai.txt', 'OFL-NotoSerifSC.txt', 'OFL-CormorantGaramond.txt'];
    const assets = FONT_PACKAGES.flatMap((fontPackage) => fontPackage.assets);
    for (const asset of assets) {
      const font = readFileSync(resolve(process.cwd(), 'assets/fonts', asset.fileName));
      expect(font.length).toBeGreaterThan(100_000);
      expect(['true', '\u0000\u0001\u0000\u0000']).toContain(font.subarray(0, 4).toString('ascii'));
    }
    for (const licenseName of expectedLicenses) {
      expect(readFileSync(resolve(process.cwd(), 'assets/fonts', licenseName), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
  });

  it('字体加载只指向本地随包资产并在开放主循环前等待解码', () => {
    const loader = readFileSync(resolve(process.cwd(), 'src/adapters/font-loader.ts'), 'utf8');
    expect(FONT_PACKAGES.flatMap((fontPackage) => fontPackage.assets).some((asset) => asset.fileName === 'LXGWWenKaiLite-Regular.ttf')).toBe(true);
    expect(loader).toContain('await face.load()');
    expect(loader).toContain('document.fonts.add(face)');
    expect(loader).not.toMatch(/https?:\/\//);
  });
});
