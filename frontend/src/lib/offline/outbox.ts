/**
 * The offline outbox: a durable queue of sales/service order creations made
 * while offline, waiting to be replayed against the real API once the
 * device reconnects. sync.ts owns replay; this module only owns storage —
 * enqueue, list, update, remove — over the `outbox` IndexedDB store added
 * in db.ts's version 2.
 *
 * Kept free of React and of `apiClient`, same discipline as db.ts and
 * cache.ts: this is a plain data-layer module, not a request layer.
 *
 * Only order *creation* goes through the outbox. Stock adjustments,
 * transfers, and admin operations are not idempotent the same way (no
 * `clientRequestId` support on the server) and must keep failing cleanly
 * offline rather than being queued here.
 */
import { openOfflineDb, OUTBOX_STORE } from './db';
import type { CreateSalesOrderPayload } from '@/types/sales';
import type { CreateServiceOrderPayload } from '@/types/service';

export type OutboxStatus = 'pending' | 'syncing' | 'rejected';

interface BaseOutboxEntry {
  /** Locally generated primary key for the outbox store itself. */
  id: string;
  createdAt: number;
  status: OutboxStatus;
  /** Number of replay attempts made so far. Bounds retry of a stuck entry. */
  attempts: number;
  /** The server's rejection message, or the last transient failure. */
  lastError?: string;
  /**
   * Generated once, at enqueue time, via `crypto.randomUUID()` — and never
   * regenerated on retry. The server dedupes creates on this value, so a
   * fresh id on retry would defeat the entire point of the outbox: the
   * server would see a brand-new order and create the exact duplicate this
   * design exists to prevent.
   */
  clientRequestId: string;
}

export interface SaleOutboxEntry extends BaseOutboxEntry {
  kind: 'sale';
  payload: CreateSalesOrderPayload;
}

export interface ServiceOutboxEntry extends BaseOutboxEntry {
  kind: 'service';
  payload: CreateServiceOrderPayload;
}

export type OutboxEntry = SaleOutboxEntry | ServiceOutboxEntry;

/**
 * Bounds how many times a single entry is replayed. Without this, a
 * permanently broken entry (one that keeps hitting a transient/network-ish
 * failure) would retry forever on every reconnect. See sync.ts for how this
 * is enforced.
 */
export const OUTBOX_MAX_ATTEMPTS = 5;

async function putEntry(entry: OutboxEntry): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  await db.put(OUTBOX_STORE, entry);
}

/**
 * Queues a sales order creation. `clientRequestId` is minted here, once,
 * and carried on the entry for the lifetime of the queue item — every
 * replay of this entry (see sync.ts) reuses it unchanged.
 */
export async function enqueueSalesOrder(payload: CreateSalesOrderPayload): Promise<SaleOutboxEntry> {
  const entry: SaleOutboxEntry = {
    id: crypto.randomUUID(),
    kind: 'sale',
    payload,
    clientRequestId: crypto.randomUUID(),
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
  };
  await putEntry(entry);
  return entry;
}

/**
 * Queues a service order creation. See `enqueueSalesOrder` for the
 * `clientRequestId` contract — identical here.
 */
export async function enqueueServiceOrder(
  payload: CreateServiceOrderPayload
): Promise<ServiceOutboxEntry> {
  const entry: ServiceOutboxEntry = {
    id: crypto.randomUUID(),
    kind: 'service',
    payload,
    clientRequestId: crypto.randomUUID(),
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
  };
  await putEntry(entry);
  return entry;
}

/**
 * Every queued entry, oldest first. Ordering matters to callers (replay
 * must be sequential, oldest first) so this sorts explicitly rather than
 * relying on IndexedDB's key order, which is by the random `id`, not by
 * `createdAt`. Returns `[]` (never throws) when indexedDB is unavailable.
 */
export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await openOfflineDb();
  if (!db) return [];
  const rows = (await db.getAll(OUTBOX_STORE)) as OutboxEntry[];
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Persists an in-place update to an existing entry (status, attempts,
 * lastError, ...). Callers pass the full entry back, matching `putEntry`'s
 * upsert semantics on the same `id`.
 */
export async function updateOutboxEntry(entry: OutboxEntry): Promise<void> {
  await putEntry(entry);
}

/** Deletes an entry outright — used once a replay succeeds, or by the Task 7 review queue's "Discard" action. */
export async function removeOutboxEntry(id: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  await db.delete(OUTBOX_STORE, id);
}

/** Count of entries still waiting to be replayed (excludes `rejected`). */
export async function countPendingOutbox(): Promise<number> {
  const rows = await listOutbox();
  return rows.filter((entry) => entry.status !== 'rejected').length;
}
