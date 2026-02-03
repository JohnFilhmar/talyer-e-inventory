'use client';

import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUpdateServiceStatus } from '@/hooks/useServices';
import {
  ServiceOrder,
  ServiceStatus,
  SERVICE_STATUS_OPTIONS,
  VALID_SERVICE_STATUS_TRANSITIONS,
  isPopulatedServiceUser,
} from '@/types/service';

interface UpdateServiceStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ServiceOrder;
}

/**
 * Get CSS classes for status badge color
 */
function getStatusColor(status: ServiceStatus): string {
  const colors: Record<ServiceStatus, string> = {
    pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    'in-progress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * UpdateServiceStatusModal component
 *
 * Modal for updating the status of a service order.
 * Shows only valid status transitions based on current status.
 * Displays warnings for stock-affecting transitions (completion, cancellation).
 */
export const UpdateServiceStatusModal: React.FC<UpdateServiceStatusModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<ServiceStatus | ''>('');

  const updateStatusMutation = useUpdateServiceStatus();

  // Get valid next statuses based on current status
  const validNextStatuses = VALID_SERVICE_STATUS_TRANSITIONS[order.status] || [];
  const availableOptions = SERVICE_STATUS_OPTIONS.filter(
    (opt) => validNextStatuses.includes(opt.value as ServiceStatus)
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
      onClose();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleClose = () => {
    setSelectedStatus('');
    onClose();
  };

  if (!isOpen) return null;

  const hasParts = order.partsUsed.length > 0;
  const hasNoMechanic = !isPopulatedServiceUser(order.assignedTo);

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
              Update Service Status
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
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}
                >
                  {SERVICE_STATUS_OPTIONS.find(opt => opt.value === order.status)?.label || order.status}
                </span>
                <span className="text-sm text-gray-500">
                  Job #{order.jobNumber}
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
                      onClick={() => setSelectedStatus(option.value as ServiceStatus)}
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

            {/* Warning: Starting work without mechanic */}
            {selectedStatus === 'in-progress' && hasNoMechanic && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  <strong>Warning:</strong> No mechanic is assigned to this job. 
                  Consider assigning a mechanic before starting work.
                </p>
              </div>
            )}

            {/* Warning: Completing service */}
            {selectedStatus === 'completed' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  <strong>Note:</strong> Completing this service will finalize all charges.
                  {hasParts && (
                    <span> The {order.partsUsed.length} part(s) used will be deducted from inventory.</span>
                  )}
                  {order.payment.status !== 'paid' && (
                    <span> Payment is still {order.payment.status}.</span>
                  )}
                </p>
              </div>
            )}

            {/* Warning: Cancellation */}
            {selectedStatus === 'cancelled' && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-700 dark:text-red-400">
                  <strong>Warning:</strong> Cancelling this service order will:
                </p>
                <ul className="text-sm text-red-700 dark:text-red-400 list-disc list-inside mt-1">
                  <li>Release any reserved parts back to inventory</li>
                  <li>Mark the job as cancelled</li>
                  {order.payment.amountPaid > 0 && (
                    <li>Note: ₱{order.payment.amountPaid.toFixed(2)} has been paid - handle refund separately</li>
                  )}
                </ul>
                <p className="text-sm text-red-700 dark:text-red-400 mt-2">
                  This action cannot be undone.
                </p>
              </div>
            )}

            {/* Info: Scheduling */}
            {selectedStatus === 'scheduled' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  <strong>Note:</strong> Scheduling this job will mark it as ready for work.
                  {hasNoMechanic && ' Remember to assign a mechanic.'}
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
                variant={selectedStatus === 'cancelled' ? 'danger' : 'primary'}
              >
                {selectedStatus === 'cancelled' ? 'Cancel Service' : 'Update Status'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdateServiceStatusModal;
