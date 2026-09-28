export type PatternMotif = 'sun' | 'hill' | 'leaf' | 'wave' | 'rain' | 'window';

export interface PostcardPattern {
  id: string;
  motif: PatternMotif;
  background: string;
  foreground: string;
  accent: string;
  seed: number;
}

const PALETTES = [
  ['#EFE1D3', '#9B7666', '#D3AA86'],
  ['#E8DED0', '#718278', '#B2A58C'],
  ['#F0E4D0', '#9A7E55', '#C7A36E'],
  ['#E4DDD5', '#766F78', '#B59A9D'],
] as const;
const MOTIFS: PatternMotif[] = ['sun', 'hill', 'leaf', 'wave', 'rain', 'window'];

export const POSTCARD_PATTERNS: readonly PostcardPattern[] = Array.from(
  { length: 24 },
  (_, index) => {
    const palette = PALETTES[index % PALETTES.length];
    return {
      id: `postcard-${String(index + 1).padStart(2, '0')}`,
      motif: MOTIFS[index % MOTIFS.length],
      background: palette[0],
      foreground: palette[1],
      accent: palette[2],
      seed: 1709 + index * 97,
    };
  },
);

export function chooseNextPatternId(
  collectedPatternIds: readonly string[],
  randomUnit: () => number,
): string {
  const collected = new Set(collectedPatternIds);
  const candidates = POSTCARD_PATTERNS.filter((pattern) => !collected.has(pattern.id));
  const pool = candidates.length > 0 ? candidates : POSTCARD_PATTERNS;
  const raw = randomUnit();
  const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
  return pool[Math.floor(normalized * pool.length)].id;
}

export function patternById(id: string): PostcardPattern {
  return POSTCARD_PATTERNS.find((pattern) => pattern.id === id) ?? POSTCARD_PATTERNS[0];
}

