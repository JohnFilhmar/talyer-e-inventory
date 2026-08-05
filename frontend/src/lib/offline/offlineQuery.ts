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
 * For a bare-array read that returns a *subset* of a store — the canonical
 * case being stock scoped to one branch (`GET /stock/branch/:id`).
 *
 * The plain `withOfflineList` cannot serve these: falling back to the whole
 * store would hand a branch every other branch's stock, and filtering is not
 * something the generic helper can know how to do. So the caller supplies a
 * predicate, which is applied only on the fallback path — the live response is
 * already scoped by the server and is returned untouched.
 *
 * Writing through `cacheList` here is deliberate and is what makes offline
 * sale creation possible at all: the New Sale screen is often the only page a
 * salesperson opens, so if this read did not populate the mirror, the product
 * picker would be empty offline even though the data had been fetched moments
 * earlier.
 */
export async function withOfflineScopedList<T extends OfflineRecord>(
  store: OfflineStoreName,
  queryFn: () => Promise<T[]>,
  matches: (row: T) => boolean
): Promise<T[]> {
  try {
    const rows = await queryFn();
    await cacheList(store, rows);
    return rows;
  } catch (error) {
    if (isNetworkError(error)) {
      const cached = await readCachedList<T>(store);
      return cached.filter(matches);
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
