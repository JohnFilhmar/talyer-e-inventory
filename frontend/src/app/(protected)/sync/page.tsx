'use client';

import React, { useMemo, useState } from 'react';
import { RefreshCw, Trash2, PackageCheck } from 'lucide-react';
import { useOutboxQueue } from '@/hooks/useOutboxQueue';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { OUTBOX_MAX_ATTEMPTS, type OutboxEntry } from '@/lib/offline/outbox';
import { PAYMENT_METHOD_OPTIONS } from '@/types/sales';
import { formatCurrency, getVehicleDisplay } from '@/types/service';

function formatQueuedAt(ms: number): string {
  return new Date(ms).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

/**
 * What a card should say about one queued entry, computed once up front so
 * the JSX below stays a plain render. Deliberately does not claim a grand
 * "total" for sale entries: the outbox only holds the branch-agnostic
 * create payload (see `buildOptimisticSalesOrder` in `useSales.ts`), not
 * the branch's `Stock.sellingPrice` the server actually prices from, so
 * the true total does not exist yet on this device. Showing a
 * self-computed number here would be a guess dressed up as a fact.
 */
function describeEntry(entry: OutboxEntry): {
  title: string;
  subtitle: string;
  amountLine: string;
  amountCaveat?: string;
} {
  if (entry.kind === 'sale') {
    const { payload } = entry;
    const itemCount = payload.items.length;
    const amountLine =
      payload.amountPaid !== undefined
        ? `Amount tendered: ${formatCurrency(payload.amountPaid)}`
        : 'No amount tendered was recorded';
    return {
      title: payload.customer.name || 'Walk-in customer',
      subtitle: `${itemCount} item${itemCount === 1 ? '' : 's'} · ${paymentMethodLabel(payload.paymentMethod)}`,
      amountLine,
      amountCaveat: 'Final total is priced by the server, from current branch stock, once this syncs.',
    };
  }

  const { payload } = entry;
  const vehicle = getVehicleDisplay(payload.vehicle);
  const quoted = (payload.laborCost ?? 0) + (payload.otherCharges ?? 0);
  return {
    title: payload.customer.name || 'Walk-in customer',
    subtitle: vehicle === 'N/A' ? payload.description : `${vehicle} · ${payload.description}`,
    amountLine: `Labor + other charges: ${formatCurrency(quoted)}`,
    amountCaveat: 'Parts are added after intake, so this does not include parts cost.',
  };
}

interface EntryCardProps {
  entry: OutboxEntry;
  actions?: React.ReactNode;
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, actions }) => {
  const info = describeEntry(entry);
  // Only the transient-server-failure path in sync.ts increments `attempts`
  // before a rejection; a straight 4xx (bad stock, validation) rejects with
  // `attempts` still 0. So `attempts > 0` on a rejected entry reliably means
  // it was auto-rejected after repeatedly hitting OUTBOX_MAX_ATTEMPTS, not
  // that the server flatly refused it on the first try — worth surfacing
  // separately from the reason text.
  const hitAttemptCap = entry.status === 'rejected' && entry.attempts > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" size="sm">
              {entry.kind === 'sale' ? 'Sale' : 'Service'}
            </Badge>
            <span className="font-medium text-black">{info.title}</span>
          </div>
          <p className="text-sm text-gray-500">{info.subtitle}</p>
          <p className="text-sm text-gray-700 mt-1">{info.amountLine}</p>
          {info.amountCaveat && <p className="text-xs text-gray-400">{info.amountCaveat}</p>}
          <p className="text-xs text-gray-400 mt-1">Queued {formatQueuedAt(entry.createdAt)}</p>
        </div>

        {entry.status === 'syncing' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 shrink-0">
            <Spinner size="sm" />
            Syncing&hellip;
          </div>
        )}
      </div>

      {entry.status === 'rejected' && (
        <div className="mt-3 bg-gray-100 border border-gray-200 rounded-md p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Server said</p>
          <p className="text-sm text-black">{entry.lastError ?? 'No reason was recorded.'}</p>
          {hitAttemptCap && (
            <p className="text-xs text-gray-500 mt-1">
              Attempts: {entry.attempts}/{OUTBOX_MAX_ATTEMPTS}
            </p>
          )}
        </div>
      )}

      {actions && <div className="mt-3">{actions}</div>}
    </div>
  );
};

interface SectionProps {
  title: string;
  hint: string;
  badgeVariant: 'primary' | 'secondary';
  entries: OutboxEntry[];
  renderActions?: (entry: OutboxEntry) => React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, hint, badgeVariant, entries, renderActions }) => {
  if (entries.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-black flex items-center gap-2">
          {title}
          <Badge variant={badgeVariant} size="sm">
            {entries.length}
          </Badge>
        </h2>
        <p className="text-sm text-gray-500">{hint}</p>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} actions={renderActions?.(entry)} />
        ))}
      </div>
    </section>
  );
};

/**
 * Review queue for the offline outbox (Task 6). This page is what makes
 * the app's conflict policy — server-authoritative, no client override —
 * honest: when two devices sell the last unit offline, the second order is
 * rejected on replay, and this is the only place that rejection is visible
 * and actionable. There is deliberately no "force" or "override" action
 * anywhere on this page; only Retry (ask the server again) and Discard
 * (give up on it). Letting a client push a rejected order through anyway
 * would mean the server was never really authoritative and stock could be
 * oversold, which is the exact failure this design exists to prevent.
 */
export default function SyncPage() {
  const { entries, discard, retry, busyId } = useOutboxQueue();
  const [discardTarget, setDiscardTarget] = useState<OutboxEntry | null>(null);

  const grouped = useMemo(() => {
    const rejected: OutboxEntry[] = [];
    const syncing: OutboxEntry[] = [];
    const pending: OutboxEntry[] = [];
    for (const entry of entries ?? []) {
      if (entry.status === 'rejected') rejected.push(entry);
      else if (entry.status === 'syncing') syncing.push(entry);
      else pending.push(entry);
    }
    return { rejected, syncing, pending };
  }, [entries]);

  const isLoading = entries === null;
  const isEmpty = !isLoading && entries.length === 0;

  const handleConfirmDiscard = async () => {
    if (!discardTarget) return;
    await discard(discardTarget.id);
    setDiscardTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 rounded-lg shrink-0">
          <RefreshCw className="w-6 h-6 text-black" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-black">Sync Queue</h1>
          <p className="text-sm text-gray-500">
            Sales and service orders created on this device while offline. The server has the
            final say on each one — a rejection here most often means someone else already sold
            the last unit before this order reached it.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white rounded-lg border border-gray-200 p-12">
          <div className="flex items-center justify-center gap-2">
            <Spinner size="lg" />
            <span className="text-gray-500">Loading sync queue&hellip;</span>
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="bg-white rounded-lg border border-gray-200 p-12">
          <div className="text-center">
            <PackageCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-black mb-2">Nothing queued</h3>
            <p className="text-gray-500">
              Every sale and service order made on this device has reached the server. There is
              nothing waiting to sync and nothing that needs review.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div className="space-y-8">
          <Section
            title="Rejected"
            hint="The server would not accept these. Discard them, or retry once you've confirmed the situation on the ground — there is no way to force one through, by design."
            badgeVariant="primary"
            entries={grouped.rejected}
            renderActions={(entry) => (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  isLoading={busyId === entry.id}
                  onClick={() => retry(entry)}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Trash2 className="w-4 h-4" />}
                  disabled={busyId === entry.id}
                  onClick={() => setDiscardTarget(entry)}
                >
                  Discard
                </Button>
              </div>
            )}
          />
          <Section
            title="Syncing"
            hint="Currently being sent to the server."
            badgeVariant="secondary"
            entries={grouped.syncing}
          />
          <Section
            title="Pending"
            hint="Waiting for a connection to sync, oldest first."
            badgeVariant="secondary"
            entries={grouped.pending}
          />
        </div>
      )}

      <Modal
        isOpen={discardTarget !== null}
        onClose={() => setDiscardTarget(null)}
        title="Discard this entry?"
        size="sm"
        showCloseButton
      >
        {discardTarget && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-700">
              This permanently deletes the queued {discardTarget.kind === 'sale' ? 'sale' : 'service'}{' '}
              order for <strong>{describeEntry(discardTarget).title}</strong>. It will not be
              retried, and this cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDiscardTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                isLoading={busyId === discardTarget.id}
                onClick={handleConfirmDiscard}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
