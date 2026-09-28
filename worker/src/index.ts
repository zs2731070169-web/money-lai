export interface HourlyStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: number): Promise<void>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  delete(keys: string[]): Promise<void>;
}

export interface DurableState {
  storage: HourlyStorage & { transaction<T>(closure: (storage: HourlyStorage) => Promise<T>): Promise<T> };
}

export interface CounterNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface WorkerEnvironment { BURN_COUNTER: CounterNamespace }

export function utcHourBucket(nowMilliseconds: number): number {
  return Math.floor(nowMilliseconds / 3_600_000);
}

export async function incrementHourlyBuckets(storage: HourlyStorage, currentHour: number): Promise<number> {
  const currentKey = `hour:${currentHour}`;
  const nextCurrent = (await storage.get<number>(currentKey) ?? 0) + 1;
  await storage.put(currentKey, nextCurrent);
  const buckets = await storage.list<number>({ prefix: 'hour:' });
  const oldestIncludedHour = currentHour - 23;
  const expiredKeys: string[] = [];
  let total = 0;
  for (const [key, value] of buckets) {
    const hour = Number(key.slice('hour:'.length));
    if (!Number.isInteger(hour) || hour < oldestIncludedHour || hour > currentHour) expiredKeys.push(key);
    else if (Number.isSafeInteger(value) && value >= 0) total += value;
  }
  if (expiredKeys.length > 0) await storage.delete(expiredKeys);
  return total;
}

export class BurnCounter {
  constructor(private readonly state: DurableState) {}
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const body = await request.arrayBuffer();
    if (body.byteLength !== 0) return Response.json({ error: 'empty body required' }, { status: 400 });
    const count = await this.state.storage.transaction((storage) => incrementHourlyBuckets(storage, utcHourBucket(Date.now())));
    return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export default {
  async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/burn') return new Response(null, { status: 404 });
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const body = await request.arrayBuffer();
    if (body.byteLength !== 0) return Response.json({ error: 'empty body required' }, { status: 400 });
    const id = environment.BURN_COUNTER.idFromName('aggregate');
    return environment.BURN_COUNTER.get(id).fetch(new Request('https://counter.internal/increment', { method: 'POST' }));
  },
};

