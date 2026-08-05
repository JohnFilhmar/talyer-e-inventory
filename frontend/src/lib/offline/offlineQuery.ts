/**
 * Wraps a TanStack Query `queryFn` so a successful list read fills the
 * offline mirror (cache.ts) and a network failure serves the last mirrored
 * rows instead of surfacing the error.
 *
 * Unlike db.ts and cache.ts, this module is allowed to depend on the request
 * layer: it imports `isNetworkError` from `apiClient` to distinguish "the
 * network is down" from "the server rejected the request." Only the former
 * falls back to the cache — a real 4xx/5xx while online must still reach the
 * caller as an error, not be masked by stale data.
 */
import { isNetworkError } from '@/lib/apiClient';
import { cacheList, readCachedList, type OfflineStoreName } from './cache';
import type { OfflineRecord } from './db';
import type { PaginatedResponse } from '@/types/api';

/**
 * For hooks whose service method resolves a bare array (e.g. categories).
 * On success, mirrors `rows` into `store` and returns them unchanged. On a
 * network error, returns whatever is currently mirrored for `store` (`[]`
 * if nothing has synced yet). Any non-network error (4xx/5xx while online)
 * is rethrown untouched so react-query's normal error state still fires.
 */
export async function withOfflineList<T extends OfflineRecord>(
  store: OfflineStoreName,
  queryFn: () => Promise<T[]>
): Promise<T[]> {
  try {
    const rows = await queryFn();
    await cacheList(store, rows);
    return rows;
  } catch (error) {
    if (isNetworkError(error)) {
      return readCachedList<T>(store);
    }
    throw error;
  }
}

/**
 * For hooks whose service method resolves `ApiResponse.paginate`'s
 * `{ data, pagination }` shape. On success, mirrors `data` into `store` and
 * returns the response unchanged (pagination included). On a network error,
 * reconstructs the same shape from the cache with `pagination: undefined` —
 * every consumer already reads pagination via optional chaining (`data
 * ?.pagination`), so an absent pagination block degrades to "no page
 * controls" rather than a runtime error.
 */
export async function withOfflinePaginatedList<T extends OfflineRecord>(
  store: OfflineStoreName,
  queryFn: () => Promise<PaginatedResponse<T>>
): Promise<PaginatedResponse<T>> {
  try {
    const response = await queryFn();
    await cacheList(store, response.data);
    return response;
  } catch (error) {
    if (isNetworkError(error)) {
      const rows = await readCachedList<T>(store);
      return { data: rows, pagination: undefined };
    }
    throw error;
  }
}
