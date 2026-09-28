import { parseBurnCountResponse } from '../core/count/burn-count';

export type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function incrementAnonymousBurnCount(
  endpoint: string | null,
  fetchImplementation: FetchImplementation = fetch,
  timeoutMs = 3000,
): Promise<number | null> {
  if (!endpoint) return null;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(endpoint, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseBurnCountResponse(await response.json());
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
