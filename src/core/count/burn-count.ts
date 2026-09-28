export function shouldDisplayBurnCount(localCadenceCount: number): boolean {
  return Number.isInteger(localCadenceCount) && localCadenceCount > 0 && localCadenceCount % 2 === 1;
}

export function parseBurnCountResponse(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('count' in value)) return null;
  const count = (value as { count?: unknown }).count;
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 1 ? count : null;
}

