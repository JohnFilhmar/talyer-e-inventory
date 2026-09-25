'use client';

import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useRefundOrder } from '@/hooks/useSales';
import {
  refundableQuantities,
  type RefundDisposition,
  type SalesOrder,
} from '@/types/sales';

interface RefundOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrder;
}

interface LineChoice {
  quantity: number;
  disposition: RefundDisposition;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

/**
 * Refund some or all of a completed, paid order (GAP-050).
 *
 * Each line takes a quantity up to what is still refundable and a disposition:
 * sellable goes back into stock, discarded is written off, for instance when the
 * fault is the manufacturer's. The amount shown is an estimate using the same
 * rule as the server, which computes and records the real figure.
 */
export const RefundOrderModal: React.FC<RefundOrderModalProps> = ({ isOpen, onClose, order }) => {
  const remaining = useMemo(() => refundableQuantities(order), [order]);
  const [choices, setChoices] = useState<Record<string, LineChoice>>({});
  const [reason, setReason] = useState('');
  const refundMutation = useRefundOrder();

  const choiceFor = (itemId: string): LineChoice =>
    choices[itemId] ?? { quantity: 0, disposition: 'sellable' };

  const setChoice = (itemId: string, patch: Partial<LineChoice>) =>
    setChoices((prev) => ({ ...prev, [itemId]: { ...choiceFor(itemId), ...patch } }));

  const selected = order.items
    .map((item) => ({ item, choice: choiceFor(item._id) }))
    .filter(({ choice }) => choice.quantity > 0);

  const factor = order.subtotal > 0 ? order.total / order.subtotal : 0;
  const estimate = selected.reduce(
    (sum, { item, choice }) => sum + (item.total / item.quantity) * choice.quantity * factor,
    0
  );

  const handleClose = () => {
    setChoices({});
    setReason('');
    refundMutation.reset();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selected.length === 0) return;
    try {
      await refundMutation.mutateAsync({
        orderId: order._id,
        payload: {
          items: selected.map(({ item, choice }) => ({
            itemId: item._id,
            quantity: choice.quantity,
            disposition: choice.disposition,
          })),
          reason: reason.trim() || undefined,
        },
      });
      handleClose();
    } catch {
      // The error is shown from refundMutation.error below.
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Refund #${order.orderNumber}`} size="lg" showCloseButton>
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        {refundMutation.error && (
          <Alert variant="error">{(refundMutation.error as Error).message}</Alert>
        )}

        <div className="space-y-3">
          {order.items.map((item) => {
            const left = remaining[item._id] ?? 0;
            const choice = choiceFor(item._id);
            return (
              <div key={item._id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-black">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    {left > 0 ? `${left} of ${item.quantity} refundable` : 'Fully refunded'}
                  </p>
                </div>
                {left > 0 && (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="text-sm font-medium text-black">
                      Quantity
                      <input
                        type="number"
                        min={0}
                        max={left}
                        step={1}
                        value={choice.quantity}
                        onChange={(e) =>
                          setChoice(item._id, {
                            quantity: Math.max(0, Math.min(left, Math.trunc(Number(e.target.value) || 0))),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-base focus:border-yellow-400 focus:outline-none"
                      />
                    </label>
                    <label className="text-sm font-medium text-black">
                      Returned item is
                      <select
                        value={choice.disposition}
                        onChange={(e) =>
                          setChoice(item._id, { disposition: e.target.value as RefundDisposition })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-base focus:border-yellow-400 focus:outline-none"
                      >
                        <option value="sellable">Sellable, return to stock</option>
                        <option value="discarded">Discarded, do not restock</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <label className="block text-sm font-medium text-black">
          Reason or notes
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="e.g. wrong size, manufacturer defect"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-base focus:border-yellow-400 focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-between rounded-lg bg-gray-100 p-3 text-sm">
          <span className="text-gray-500">Estimated refund</span>
          <span className="font-bold text-black">{formatCurrency(estimate)}</span>
        </div>
        <p className="text-xs text-gray-500">
          The final amount is calculated by the server and recorded against this branch.
        </p>

        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={refundMutation.isPending}
            disabled={selected.length === 0}
          >
            Record refund
          </Button>
        </div>
      </form>
    </Modal>
  );
};
