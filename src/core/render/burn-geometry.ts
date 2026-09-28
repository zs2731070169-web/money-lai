export const BURN_LINE_SAMPLE_COUNT = 48;
export const BURN_PAPER_STRIP_COUNT = 6;

export interface BurnGeometryBuffer {
  lineX: Float32Array;
  lineY: Float32Array;
  stripOffsetX: Float32Array;
  stripOffsetY: Float32Array;
  progress: number;
}

export function createBurnGeometryBuffer(): BurnGeometryBuffer {
  return {
    lineX: new Float32Array(BURN_LINE_SAMPLE_COUNT),
    lineY: new Float32Array(BURN_LINE_SAMPLE_COUNT),
    stripOffsetX: new Float32Array(BURN_PAPER_STRIP_COUNT),
    stripOffsetY: new Float32Array(BURN_PAPER_STRIP_COUNT),
    progress: 0,
  };
}

function seededNoise(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value ^= value >>> 16;
  return value / 0xffff_ffff;
}

export function updateBurnGeometryInto(
  buffer: BurnGeometryBuffer,
  rect: { left: number; top: number; width: number; height: number },
  progress: number,
  seed: number,
): BurnGeometryBuffer {
  const clamped = Math.max(0, Math.min(1, progress));
  const baseY = rect.top + rect.height * clamped;
  for (let index = 0; index < BURN_LINE_SAMPLE_COUNT; index += 1) {
    const ratio = index / (BURN_LINE_SAMPLE_COUNT - 1);
    const lowFrequency = Math.sin(ratio * Math.PI * 3 + seed * 0.013) * 3.2;
    const stableJitter = (seededNoise(seed, index) - 0.5) * 3;
    buffer.lineX[index] = rect.left + rect.width * ratio;
    buffer.lineY[index] = Math.max(rect.top, Math.min(rect.top + rect.height, baseY + lowFrequency + stableJitter));
  }
  for (let index = 0; index < BURN_PAPER_STRIP_COUNT; index += 1) {
    buffer.stripOffsetX[index] = (seededNoise(seed + 7, index) - 0.5) * 10;
    buffer.stripOffsetY[index] = -clamped * (10 + seededNoise(seed + 13, index) * 18);
  }
  buffer.progress = clamped;
  return buffer;
}

