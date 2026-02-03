'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUpdateOrderStatus } from '@/hooks/useSales';
import {
  type SalesOrder,
  type OrderStatus,
  ORDER_STATUS_OPTIONS,
  getValidNextStatuses,
  getOrderStatusColor,
} from '@/types/sales';

interface UpdateStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrder;
}

/**
 * UpdateStatusModal component
 *
 * Modal for updating the status of a sales order.
 * Shows only valid status transitions based on current status.
 */
export const UpdateStatusModal: React.FC<UpdateStatusModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [notes, setNotes] = useState('');

  const updateStatusMutation = useUpdateOrderStatus();

  // Get valid next statuses based on current status
  const validNextStatuses = getValidNextStatuses(order.status);
  const availableOptions = ORDER_STATUS_OPTIONS.filter(
    (opt) => validNextStatuses.includes(opt.value)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStatus) return;

    try {
      await updateStatusMutation.mutateAsync({
        orderId: order._id,
        payload: {
          status: selectedStatus,
        },
      });

      // Reset and close
      setSelectedStatus('');
      setNotes('');
      onClose();
    } catch (error) {
      // Error handled by mutation's onError
      console.error('Failed to update status:', error);
    }
  };

  const handleClose = () => {
    setSelectedStatus('');
    setNotes('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md transform rounded-lg bg-white dark:bg-gray-900 shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Update Order Status
            </h2>
            <button
              onClick={handleClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Current Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Status
              </label>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getOrderStatusColor(order.status)}`}
                >
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
                <span className="text-sm text-gray-500">
                  Order #{order.orderNumber}
                </span>
              </div>
            </div>

            {/* New Status Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Status
              </label>
              {availableOptions.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {availableOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedStatus(option.value)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        selectedStatus === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No status transitions available from current status.
                </p>
              )}
            </div>

            {/* Notes (optional) */}
            <div>
              <label
                htmlFor="status-notes"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Notes (optional)
              </label>
              <textarea
                id="status-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Add notes about this status change..."
              />
            </div>

            {/* Warning for cancelled status */}
            {selectedStatus === 'cancelled' && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-700 dark:text-red-400">
                  <strong>Warning:</strong> Cancelling this order will release any reserved stock
                  back to inventory. This action cannot be undone.
                </p>
              </div>
            )}

            {/* Warning for completed status */}
            {selectedStatus === 'completed' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  <strong>Note:</strong> Completing this order will deduct the items from inventory.
                  {order.payment.status === 'paid' && ' A transaction record will also be created.'}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedStatus || updateStatusMutation.isPending}
                isLoading={updateStatusMutation.isPending}
              >
                Update Status
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdateStatusModal;
