import { POSTCARD_NAMES } from '../content/copy';

/**
 * 图鉴只登记随包发布的真实位图资产。新增条目前必须先加入对应 PNG，
 * 禁止用 Canvas 图元、纯色块或程序化纹理伪造新的明信片。
 */
export interface PostcardCatalogItem {
  id: string;
  name: string;
  assetKey: 'letterPaper';
  burnSeed: number;
}

export const POSTCARD_CATALOG: readonly PostcardCatalogItem[] = [
  { id: 'postcard-lily-paper', name: POSTCARD_NAMES['postcard-lily-paper'], assetKey: 'letterPaper', burnSeed: 1709 },
] as const;

export const DEFAULT_POSTCARD_ID = POSTCARD_CATALOG[0].id;

export function chooseNextPostcardId(
  collectedPostcardIds: readonly string[],
  randomUnit: () => number,
): string {
  const collected = new Set(collectedPostcardIds);
  const uncollected = POSTCARD_CATALOG.filter((item) => !collected.has(item.id));
  const pool = uncollected.length > 0 ? uncollected : POSTCARD_CATALOG;
  const raw = randomUnit();
  const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
  return pool[Math.floor(normalized * pool.length)].id;
}

export function postcardById(id: string): PostcardCatalogItem {
  return POSTCARD_CATALOG.find((item) => item.id === id) ?? POSTCARD_CATALOG[0];
}

/** 旧版 24 个程序化图案统一迁移到当前真实位图，保留手帐记录。 */
export function normalizePostcardId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  if (POSTCARD_CATALOG.some((item) => item.id === id)) return id;
  return /^postcard-\d{2}$/.test(id) ? DEFAULT_POSTCARD_ID : null;
}
