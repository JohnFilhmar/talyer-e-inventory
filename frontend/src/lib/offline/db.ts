/**
 * IndexedDB mirror of the offline working set.
 *
 * Deliberately free of React and of `apiClient` imports: this module must
 * stay usable from plain modules (and, eventually, a service worker) with no
 * dependency on the request layer or a component tree.
 *
 * `indexedDB` does not exist during SSR or at Next.js build time, so every
 * exported function guards on its presence before touching it and degrades
 * to a no-op / empty result instead of throwing.
 *
 * The database is opened untyped (no `idb` `DBSchema` generic) on purpose:
 * each store holds a different domain type (Product, Category, Stock, ...),
 * and a shared schema value type would either have to be `unknown`-indexed
 * (which real domain interfaces without an explicit index signature fail to
 * satisfy as a generic constraint) or duplicate every domain type here.
 * Callers get their type safety from this module's own exported generics
 * (`T extends OfflineRecord`), not from `idb`'s schema.
 */
import { openDB, type IDBPDatabase } from 'idb';

/**
 * Object store names that mirror a domain's list data, keyed on `_id`.
 * These names are also used as the cache-layer "store" identifier passed
 * around by cache.ts and offlineQuery.ts.
 */
export const OFFLINE_STORE_NAMES = [
  'products',
  'categories',
  'motorcycleModels',
  'stock',
  'suppliers',
  'salesOrders',
  'serviceOrders',
  'branches',
  'stockTransfers',
] as const;

export type OfflineStoreName = (typeof OFFLINE_STORE_NAMES)[number];

/**
 * Minimal shape every cached row must satisfy: the same `_id` convention
 * used throughout the Mongoose-backed API. Intentionally has no index
 * signature — every domain type (Product, Category, ...) already satisfies
 * this without modification.
 */
export interface OfflineRecord {
  _id: string;
}

interface MetaRecord {
  store: OfflineStoreName;
  lastSyncedAt: number;
}

const DB_NAME = 'talyer-offline';
// Bump whenever a store is added. The upgrade handler creates any store
// missing from OFFLINE_STORE_NAMES, but it only runs when this number rises —
// leave it and an existing browser keeps its old schema and every read of the
// new store throws NotFoundError.
// v2 added the outbox; v3 added stockTransfers; v4 added motorcycleModels.
const DB_VERSION = 4;
const META_STORE = 'meta';

/**
 * The offline outbox (Task 6): queued sales/service order creations waiting
 * to be replayed. Deliberately not part of `OFFLINE_STORE_NAMES` — those
 * stores mirror server records keyed on `_id`, while an outbox entry has no
 * server id yet (that's the point) and is keyed on its own generated `id`
 * instead. Exported so outbox.ts doesn't hardcode the string a second time.
 */
export const OUTBOX_STORE = 'outbox';

/**
 * Memoised handle to the open database. `null` means "indexedDB is not
 * available in this environment" (SSR, build, or a browser with it
 * disabled) rather than "not opened yet" — callers treat both the same way,
 * as a cache miss.
 */
let dbPromise: Promise<IDBPDatabase> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Opens (and memoises) the offline database. Safe to call from server-side
 * code paths: it resolves to `null` whenever `indexedDB` is unavailable
 * instead of throwing.
 */
export function openOfflineDb(): Promise<IDBPDatabase | null> {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of OFFLINE_STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: '_id' });
          }
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'store' });
        }
        // Version 2. Guarded the same way as the version-1 stores above, so
        // a browser that already has the version-1 database upgrades in
        // place instead of losing its mirrored data.
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Replaces every row of `store` whose `_id` matches an incoming row, and
 * inserts the rest. Does not clear rows absent from `rows` — callers that
 * want a full mirror should pass the complete list.
 */
export async function putMany<T extends OfflineRecord>(
  store: OfflineStoreName,
  rows: T[]
): Promise<void> {
  if (rows.length === 0) return;

  const db = await openOfflineDb();
  if (!db) return;

  const tx = db.transaction(store, 'readwrite');
  await Promise.all([...rows.map((row) => tx.store.put(row)), tx.done]);
}

/**
 * All rows currently mirrored for `store`. Empty array (not an error) when
 * indexedDB is unavailable or the store has never been populated.
 */
export async function getAll<T extends OfflineRecord>(store: OfflineStoreName): Promise<T[]> {
  const db = await openOfflineDb();
  if (!db) return [];
  return (await db.getAll(store)) as T[];
}

/**
 * A single cached row by id, or `undefined` if it was never cached (or
 * indexedDB is unavailable).
 */
export async function getById<T extends OfflineRecord>(
  store: OfflineStoreName,
  id: string
): Promise<T | undefined> {
  const db = await openOfflineDb();
  if (!db) return undefined;
  return (await db.get(store, id)) as T | undefined;
}

/**
 * Records "now" as the last time `store` was successfully synced from the
 * network. Best-effort: swallows the write if indexedDB is unavailable.
 */
export async function setLastSyncedAt(store: OfflineStoreName): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  const record: MetaRecord = { store, lastSyncedAt: Date.now() };
  await db.put(META_STORE, record);
}

/**
 * The last successful sync time for `store`, or `undefined` if it has never
 * synced (or indexedDB is unavailable).
 */
export async function getLastSyncedAt(store: OfflineStoreName): Promise<number | undefined> {
  const db = await openOfflineDb();
  if (!db) return undefined;
  const record = (await db.get(META_STORE, store)) as MetaRecord | undefined;
  return record?.lastSyncedAt;
}

/**
 * Wipes every mirrored store and the meta store. Called on logout so a
 * shared-tablet session never leaks one user's branch data or order history
 * to the next person who signs in.
 */
export async function clearAllStores(): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;

  const storeNames: string[] = [...OFFLINE_STORE_NAMES, META_STORE];
  const tx = db.transaction(storeNames, 'readwrite');
  await Promise.all([...storeNames.map((name) => tx.objectStore(name).clear()), tx.done]);
}
