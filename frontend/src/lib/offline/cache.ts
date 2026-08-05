/**
 * Read-through helpers over the offline mirror (db.ts). This is the layer
 * `offlineQuery.ts` and the domain hooks talk to; it never imports React or
 * `apiClient` either, keeping the same plain-module guarantee as db.ts.
 */
import {
  clearAllStores,
  getAll,
  putMany,
  setLastSyncedAt,
  type OfflineRecord,
  type OfflineStoreName,
} from './db';

export type { OfflineStoreName } from './db';

/**
 * True when the browser reports it has no network connectivity. Guarded for
 * SSR, where `navigator` does not exist — treated as "online" there since no
 * fetch is actually in flight during render.
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

/**
 * Mirrors a successful list response into indexedDB and stamps the store's
 * `lastSyncedAt`. Callers must only invoke this with rows from a genuinely
 * successful, authorised read — never with an error payload — so the cache
 * can't be poisoned with a state the user has no way to retry past.
 */
export async function cacheList<T extends OfflineRecord>(
  store: OfflineStoreName,
  rows: T[]
): Promise<void> {
  await putMany(store, rows);
  await setLastSyncedAt(store);
}

/**
 * The rows currently mirrored for `store`. Returns `[]` (never throws) when
 * nothing has been cached yet or indexedDB is unavailable.
 */
export async function readCachedList<T extends OfflineRecord>(
  store: OfflineStoreName
): Promise<T[]> {
  return getAll<T>(store);
}

/**
 * Reads one mirrored record by `_id`, or `undefined` if it was never cached.
 *
 * Detail pages need this: a list read fills the store, so opening a row the
 * user has already seen works offline — but only if the detail view is willing
 * to look here instead of going straight to the network. Without it, tapping
 * an order offline fails outright even though its data is sitting in the
 * mirror.
 */
export async function readCachedById<T extends OfflineRecord>(
  store: OfflineStoreName,
  id: string
): Promise<T | undefined> {
  const rows = await getAll<T>(store);
  return rows.find((row) => row._id === id);
}

/**
 * Wipes the entire offline mirror. This is a shared-tablet app: if the
 * mirror survived logout, the next person to sign in would see the
 * previous user's branch data and order history until every store happened
 * to be overwritten by a fresh fetch. Call this from the logout path,
 * unconditionally — it only touches indexedDB, so it works even when the
 * logout network request itself failed offline.
 */
export async function clearOfflineCache(): Promise<void> {
  await clearAllStores();
}
