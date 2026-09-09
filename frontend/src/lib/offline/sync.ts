/**
 * Replays the offline outbox (outbox.ts) against the real API once the
 * device is back online.
 *
 * Unlike outbox.ts, this module is allowed to depend on the request layer:
 * it calls `salesService`/`serviceService` directly (not through a React
 * hook — replay is triggered from a `window` event, not a component) and
 * uses `isNetworkError` from apiClient to tell "the network is down" apart
 * from "the server rejected this payload." That distinction is the whole
 * point of the outbox: a network failure must never be treated the same as
 * a real rejection.
 */
import type { AxiosError } from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import { isNetworkError } from '@/lib/apiClient';
import { salesService } from '@/lib/services/salesService';
import { serviceService } from '@/lib/services/serviceService';
import { salesKeys } from '@/hooks/useSales';
import { serviceKeys } from '@/hooks/useServices';
import {
  listOutbox,
  removeOutboxEntry,
  updateOutboxEntry,
  OUTBOX_MAX_ATTEMPTS,
  type OutboxEntry,
} from './outbox';
import type { ApiResponse } from '@/types/api';

/**
 * Failure classification used by `replayOutbox`. This is the crux of the
 * whole module — getting the 5xx row wrong in either direction is a
 * data-loss bug:
 *
 * | Cause                              | Outcome for this entry | Continue run? | Counts toward `attempts`? |
 * |-------------------------------------|-------------------------|----------------|----------------------------|
 * | Network error (device offline)      | stays `pending`          | stop           | no                         |
 * | 4xx (server rejected payload)       | `rejected` + message     | continue       | no (rejected outright)     |
 * | 5xx (server-side failure)           | stays `pending`          | stop           | yes                        |
 * | 5xx and attempts >= OUTBOX_MAX_ATTEMPTS | `rejected` + reason  | continue       | —                          |
 *
 * A network error and a 5xx both leave the entry `pending` and stop the run
 * on purpose: neither is this payload's fault. They differ on the attempt
 * cap — a device that is offline for a while and fires several spurious
 * replay attempts must never have that offline stretch alone tip an entry
 * into `rejected`, so network errors are never counted. A payload that
 * reliably 500s, by contrast, is a real (if server-side) problem, so it is
 * capped rather than retried forever on every reconnect.
 */
type ReplayOutcome = 'synced' | 'network-stop' | 'rejected' | 'transient-stop';

/**
 * In-module guard against overlapping runs. `replayOutbox()` can be
 * triggered by the `online` event and by app mount within the same tick;
 * without this, both callers would read the same `pending` entries and
 * replay them twice. Released in `finally` so a thrown error (a bug, not a
 * classified failure — every classified failure is caught internally)
 * cannot wedge the queue into "replay never runs again."
 */
let isReplaying = false;

function extractErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<ApiResponse> | undefined;
  const serverMessage = axiosError?.response?.data?.message;
  if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
    return serverMessage;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Replay failed for an unknown reason';
}

function getHttpStatus(error: unknown): number | undefined {
  const axiosError = error as AxiosError | undefined;
  return axiosError?.response?.status;
}

/** Sends one entry's payload to the real endpoint, reusing its stored `clientRequestId`. */
async function sendEntry(entry: OutboxEntry): Promise<void> {
  if (entry.kind === 'sale') {
    await salesService.create({ ...entry.payload, clientRequestId: entry.clientRequestId });
  } else {
    await serviceService.create({ ...entry.payload, clientRequestId: entry.clientRequestId });
  }
}

/**
 * Replays one entry and reports what happened, mutating and persisting the
 * entry's state as a side effect (so a crash between entries leaves the
 * store consistent with what was actually attempted).
 */
async function replayEntry(entry: OutboxEntry): Promise<ReplayOutcome> {
  entry.status = 'syncing';
  await updateOutboxEntry(entry);

  try {
    // A response here means the server accepted the request — either a
    // fresh 201, or a 200 replay hit on `clientRequestId` for a response we
    // sent before but never got to see (see scenario 5 in the report).
    // Either way this entry is done.
    await sendEntry(entry);
    await removeOutboxEntry(entry.id);
    return 'synced';
  } catch (error) {
    // Network error: the device is simply offline (again). Not this
    // payload's fault — leave it and everything after it `pending`, and
    // stop the whole run rather than guess at ordering under a flaky link.
    // Deliberately does NOT count against `attempts`: a device that stays
    // offline for a while and fires several spurious replay attempts must
    // never have that offline stretch alone tip an entry into `rejected`.
    if (isNetworkError(error)) {
      entry.status = 'pending';
      await updateOutboxEntry(entry);
      return 'network-stop';
    }

    const status = getHttpStatus(error);

    // 4xx: permanent for this exact payload (insufficient stock, a bad
    // reference, failed validation, ...). Record why and move on — the
    // server has already adjudicated this one. Not attempt-capped: the
    // server rejected it outright, so there is nothing to gain by counting
    // up to a limit first.
    if (status !== undefined && status >= 400 && status < 500) {
      entry.status = 'rejected';
      entry.lastError = extractErrorMessage(error);
      await updateOutboxEntry(entry);
      return 'rejected';
    }

    // 5xx (or a response shape we don't recognise — treated the same,
    // conservatively, since we cannot prove it was this payload's fault):
    // transient server-side failure. Never discard a real sale over a
    // deploy-time 500. This IS attempt-capped, unlike the network case
    // above, so a payload that reliably 500s (a real server bug, not mere
    // downtime) eventually stops retrying instead of looping on every
    // reconnect forever.
    entry.attempts += 1;
    if (entry.attempts >= OUTBOX_MAX_ATTEMPTS) {
      entry.status = 'rejected';
      entry.lastError = `Gave up after ${OUTBOX_MAX_ATTEMPTS} attempts: ${extractErrorMessage(error)}`;
      await updateOutboxEntry(entry);
      return 'rejected';
    }

    entry.status = 'pending';
    entry.lastError = extractErrorMessage(error);
    await updateOutboxEntry(entry);
    return 'transient-stop';
  }
}

/**
 * Replays every queued entry, strictly sequentially and oldest first —
 * never `Promise.all`. Two queued orders can draw on the same stock, and
 * the server is authoritative on who gets it; replaying in parallel would
 * make the outcome depend on network timing instead of submission order.
 *
 * A `syncing` entry found at the start of a run (left behind by a tab that
 * crashed or was closed mid-request) is retried exactly like `pending` —
 * replay is idempotent via `clientRequestId`, so resuming it is safe
 * whether or not the original request actually reached the server.
 *
 * Pass `queryClient` to invalidate the sales/service list (and stock, for
 * sales) query keys after a run that synced at least one entry, so open
 * list views refresh. Safe to omit (e.g. from a non-React caller) — the
 * outbox itself is still replayed, just without cache invalidation.
 */
export async function replayOutbox(queryClient?: QueryClient): Promise<boolean> {
  if (isReplaying) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  isReplaying = true;
  let stalled = false;
  try {
    const entries = await listOutbox();
    let syncedSales = false;
    let syncedServices = false;

    for (const entry of entries) {
      if (entry.status === 'rejected') continue;

      const outcome = await replayEntry(entry);

      if (outcome === 'synced') {
        if (entry.kind === 'sale') syncedSales = true;
        else syncedServices = true;
        continue;
      }

      if (outcome === 'rejected') continue;

      // 'network-stop' or 'transient-stop': stop the whole run. Everything
      // from here on stays untouched and still `pending`, in order.
      //
      // `stalled` is what tells initOutboxSync to schedule its own retry. A
      // transient stop leaves the queue full while the device is still online,
      // so no `online` event will ever fire to restart it: the interface never
      // dropped. Without this the queue sat there until a page reload.
      stalled = true;
      break;
    }

    if (queryClient) {
      if (syncedSales) {
        queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
        queryClient.invalidateQueries({ queryKey: salesKeys.stats() });
        queryClient.invalidateQueries({ queryKey: ['stock'] });
      }
      if (syncedServices) {
        queryClient.invalidateQueries({ queryKey: serviceKeys.lists() });
        queryClient.invalidateQueries({ queryKey: serviceKeys.myJobs() });
      }
    }
  } finally {
    isReplaying = false;
  }

  return stalled;
}

/** Backoff schedule for retrying a stalled run, in milliseconds. */
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];

/**
 * Wires `replayOutbox` to the `online` event and runs it once immediately
 * if the browser already reports a connection — covering the case where
 * the app is opened already online with entries left over from a previous
 * offline session, which never fires an `online` event of its own. Returns
 * an unsubscribe function for the caller's cleanup.
 *
 * A run that stops on a 5xx while the device stays online also schedules its
 * own bounded retry. Nothing else would restart it: the `online` event needs an
 * interface to have dropped, and `useOutboxQueue` only polls IndexedDB for
 * display. A backend restart during a busy hour otherwise left queued sales
 * sitting in "Pending" with no control anywhere to push them, recoverable only
 * by reloading the page or toggling the device's wifi.
 *
 * The schedule is bounded rather than indefinite. Entries carry their own
 * `attempts` counter and are rejected at `OUTBOX_MAX_ATTEMPTS`, so an endlessly
 * retrying timer would keep waking to do nothing; the `online` event and the
 * manual Retry on /sync remain as the ways back.
 *
 * SSR-safe: a no-op returning a no-op cleanup when `window` is unavailable.
 */
export function initOutboxSync(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined') return () => {};

  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryIndex = 0;
  let cancelled = false;

  const clearRetry = () => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const run = async () => {
    if (cancelled) return;

    const stalled = await replayOutbox(queryClient);
    if (cancelled) return;

    if (!stalled) {
      // A clean run resets the schedule, so the next stall starts short again.
      retryIndex = 0;
      clearRetry();
      return;
    }

    if (retryIndex >= RETRY_DELAYS_MS.length) return;

    const delay = RETRY_DELAYS_MS[retryIndex];
    retryIndex += 1;
    clearRetry();
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void run();
    }, delay);
  };

  const handleOnline = () => {
    // A real reconnection is the strongest signal there is, so it restarts the
    // schedule rather than waiting out the current backoff.
    retryIndex = 0;
    clearRetry();
    void run();
  };

  if (navigator.onLine) {
    void run();
  }

  window.addEventListener('online', handleOnline);

  return () => {
    // Must clear the timer, or a scheduled retry outlives the provider and
    // fires against a torn-down query client.
    cancelled = true;
    clearRetry();
    window.removeEventListener('online', handleOnline);
  };
}
