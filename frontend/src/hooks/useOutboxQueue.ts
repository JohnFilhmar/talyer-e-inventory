import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  listOutbox,
  removeOutboxEntry,
  updateOutboxEntry,
  type OutboxEntry,
} from '@/lib/offline/outbox';
import { replayOutbox } from '@/lib/offline/sync';

/**
 * How often to re-read the outbox while this hook is mounted.
 *
 * outbox.ts (Task 6) is a deliberately plain IndexedDB module — put/get/
 * delete, no subscribe/emit hook for callers to react to. Two things can
 * change the queue without this hook's own `discard`/`retry` calls: a
 * background replay triggered by `initOutboxSync`'s `online` listener in
 * AuthProvider.tsx, and another tab open on the same device. Adding an
 * event bus to outbox.ts to cover that would widen a module that Task 6
 * intentionally kept framework-free, so this polls instead — every read is
 * a local IndexedDB call, not a network request, so a short interval is
 * cheap. Reads are still refreshed immediately after this hook's own
 * mutations and shortly after an `online` event, so the common case (the
 * person who just clicked Retry, or who just reconnected) never has to
 * wait out a poll tick.
 */
const POLL_INTERVAL_MS = 3000;

/** Grace period after an `online` event before re-reading, to give the
 * auto-replay `initOutboxSync` triggers elsewhere a chance to land. */
const ONLINE_REFRESH_DELAY_MS = 500;

/**
 * Shared read/write view of the offline outbox for the navbar badge
 * (`PendingBadge`) and the `/sync` review page. Both need the same list —
 * the badge derives a count from it, the review page renders it grouped by
 * status — so this hook is the single place that owns polling and the two
 * user-facing mutations (Discard, Retry), keeping both call sites trivial
 * and consistent.
 */
export function useOutboxQueue() {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<OutboxEntry[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const rows = await listOutbox();
    if (mountedRef.current) setEntries(rows);
    return rows;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const handleOnline = () => {
      window.setTimeout(() => void refresh(), ONLINE_REFRESH_DELAY_MS);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [refresh]);

  /** Deletes a queued entry outright. Used for the Discard action — the
   * caller is responsible for confirming with the user first. */
  const discard = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await removeOutboxEntry(id);
        await refresh();
      } finally {
        setBusyId((current) => (current === id ? null : current));
      }
    },
    [refresh]
  );

  /** Sets a `rejected` entry back to `pending` and immediately triggers a
   * replay of the whole outbox (sequential, oldest-first, unchanged from
   * Task 6 — this does not grant a fresh attempt budget or reorder
   * anything). No "force" variant exists on purpose: the server stays the
   * sole authority on whether the retried request succeeds. */
  const retry = useCallback(
    async (entry: OutboxEntry) => {
      setBusyId(entry.id);
      try {
        await updateOutboxEntry({ ...entry, status: 'pending' });
        await refresh();
        await replayOutbox(queryClient);
        await refresh();
      } finally {
        setBusyId((current) => (current === entry.id ? null : current));
      }
    },
    [refresh, queryClient]
  );

  return { entries, refresh, discard, retry, busyId };
}
