import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The outbox classification table, verified.
 *
 * `sync.ts` documents this table in a comment and calls getting the 5xx row
 * wrong "a data-loss bug" in either direction. Nothing checked it: the frontend
 * had no test runner at all (GAP-044).
 *
 * The three rows that matter:
 *   network error -> stays pending, stops the run, does NOT count an attempt
 *   4xx           -> rejected with the server's message, run continues
 *   5xx           -> stays pending, stops the run, DOES count an attempt
 *
 * Treating a 5xx as permanent would discard real sales during a deploy;
 * counting a network error toward the cap would let one offline stretch reject
 * a queue that was never the payload's fault.
 */

const store = vi.hoisted(() => ({ entries: [] as Record<string, unknown>[] }));

vi.mock('@/lib/services/salesService', () => ({
  salesService: { create: vi.fn() },
}));
vi.mock('@/lib/services/serviceService', () => ({
  serviceService: { create: vi.fn() },
}));
vi.mock('@/lib/apiClient', () => ({
  isNetworkError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { isNetwork?: boolean }).isNetwork),
}));
vi.mock('@/hooks/useSales', () => ({
  salesKeys: { lists: () => ['sales', 'list'], stats: () => ['sales', 'stats'] },
}));
vi.mock('@/hooks/useServices', () => ({
  serviceKeys: { lists: () => ['services', 'list'], myJobs: () => ['services', 'my-jobs'] },
}));
vi.mock('./outbox', () => ({
  OUTBOX_MAX_ATTEMPTS: 5,
  listOutbox: vi.fn(async () => store.entries),
  updateOutboxEntry: vi.fn(async () => {}),
  removeOutboxEntry: vi.fn(async (id: string) => {
    store.entries = store.entries.filter((entry) => entry.id !== id);
  }),
}));

import { replayOutbox } from './sync';
import { salesService } from '@/lib/services/salesService';
import { removeOutboxEntry } from './outbox';

type TestEntry = {
  id: string;
  kind: 'sale' | 'service';
  createdAt: number;
  status: string;
  attempts: number;
  clientRequestId: string;
  lastError?: string;
  payload: Record<string, unknown>;
};

const saleEntry = (overrides: Record<string, unknown> = {}): TestEntry => ({
  id: 'entry-1',
  kind: 'sale',
  createdAt: 1,
  status: 'pending',
  attempts: 0,
  clientRequestId: 'req-1',
  payload: { branch: 'b1', items: [] },
  ...overrides,
});

const networkError = () => ({ isNetwork: true, message: 'Network Error' });
const httpError = (status: number, message = 'nope') => ({
  isNetwork: false,
  response: { status, data: { message } },
});

beforeEach(() => {
  store.entries = [];
  vi.mocked(salesService.create).mockReset();
  vi.mocked(removeOutboxEntry).mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('replayOutbox classification', () => {
  it('removes an entry the server accepted', async () => {
    const entry = saleEntry();
    store.entries = [entry];
    vi.mocked(salesService.create).mockResolvedValue({} as never);

    const stalled = await replayOutbox();

    expect(stalled).toBe(false);
    expect(removeOutboxEntry).toHaveBeenCalledWith('entry-1');
  });

  it('leaves an entry pending on a network error and does not count an attempt', async () => {
    const entry = saleEntry();
    store.entries = [entry];
    vi.mocked(salesService.create).mockRejectedValue(networkError());

    const stalled = await replayOutbox();

    expect(stalled).toBe(true);
    expect(entry.status).toBe('pending');
    // The rule that keeps an offline stretch from rejecting a healthy queue.
    expect(entry.attempts).toBe(0);
    expect(removeOutboxEntry).not.toHaveBeenCalled();
  });

  it('rejects an entry on a 4xx and keeps the server message', async () => {
    const entry = saleEntry();
    store.entries = [entry];
    vi.mocked(salesService.create).mockRejectedValue(httpError(400, 'Insufficient stock'));

    await replayOutbox();

    expect(entry.status).toBe('rejected');
    expect(entry.lastError).toBe('Insufficient stock');
    // The server adjudicated it, so there is nothing to count up to.
    expect(entry.attempts).toBe(0);
  });

  it('keeps an entry pending on a 5xx and counts the attempt', async () => {
    const entry = saleEntry();
    store.entries = [entry];
    vi.mocked(salesService.create).mockRejectedValue(httpError(503, 'Service Unavailable'));

    const stalled = await replayOutbox();

    expect(stalled).toBe(true);
    expect(entry.status).toBe('pending');
    expect(entry.attempts).toBe(1);
    expect(removeOutboxEntry).not.toHaveBeenCalled();
  });

  it('rejects a 5xx entry once it reaches the attempt cap', async () => {
    const entry = saleEntry({ attempts: 4 });
    store.entries = [entry];
    vi.mocked(salesService.create).mockRejectedValue(httpError(500));

    await replayOutbox();

    expect(entry.attempts).toBe(5);
    expect(entry.status).toBe('rejected');
    expect(entry.lastError).toMatch(/Gave up after 5 attempts/);
  });

  it('treats an error with no recognisable status conservatively, as transient', async () => {
    const entry = saleEntry();
    store.entries = [entry];
    vi.mocked(salesService.create).mockRejectedValue({ isNetwork: false, message: 'weird' });

    await replayOutbox();

    expect(entry.status).toBe('pending');
    expect(entry.attempts).toBe(1);
  });
});

describe('replayOutbox ordering and continuation', () => {
  it('continues past a rejected entry but stops at a transient one', async () => {
    const first = saleEntry({ id: 'a', clientRequestId: 'req-a' });
    const second = saleEntry({ id: 'b', clientRequestId: 'req-b' });
    const third = saleEntry({ id: 'c', clientRequestId: 'req-c' });
    store.entries = [first, second, third];

    vi.mocked(salesService.create)
      .mockRejectedValueOnce(httpError(400, 'rejected outright'))
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce({} as never);

    const stalled = await replayOutbox();

    expect(first.status).toBe('rejected');
    expect(second.status).toBe('pending');
    // Never reached: the run stops at the transient failure so ordering holds.
    expect(third.status).toBe('pending');
    expect(third.attempts).toBe(0);
    expect(stalled).toBe(true);
  });

  it('skips entries already rejected', async () => {
    store.entries = [saleEntry({ id: 'done', status: 'rejected' })];

    await replayOutbox();

    expect(salesService.create).not.toHaveBeenCalled();
  });

  // The rule the whole design rests on: regenerate this and the server sees a
  // brand-new order, which is the duplicate the outbox exists to prevent.
  it('replays with the entry stored clientRequestId, unchanged', async () => {
    const entry = saleEntry({ clientRequestId: 'must-not-change' });
    store.entries = [entry];
    vi.mocked(salesService.create).mockRejectedValueOnce(httpError(500));

    await replayOutbox();
    expect(salesService.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientRequestId: 'must-not-change' })
    );

    vi.mocked(salesService.create).mockResolvedValueOnce({} as never);
    await replayOutbox();

    expect(salesService.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientRequestId: 'must-not-change' })
    );
  });
});
