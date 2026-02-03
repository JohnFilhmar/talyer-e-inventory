'use client';

import React, { useState, useMemo } from 'react';
import { X, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUpdateServicePayment } from '@/hooks/useServices';
import {
  ServiceOrder,
  ServicePaymentStatus,
  PaymentMethod,
  PAYMENT_METHOD_OPTIONS,
  SERVICE_PAYMENT_STATUS_OPTIONS,
} from '@/types/service';

interface UpdateServicePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ServiceOrder;
}

/**
 * Format currency in Philippine Peso
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * Get CSS classes for payment status badge
 */
function getPaymentStatusColor(status: ServicePaymentStatus): string {
  const colors: Record<ServicePaymentStatus, string> = {
    pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * UpdateServicePaymentModal component
 *
 * Modal for updating payment information on a service order.
 * Shows balance due, payment method, and amount paid.
 * Auto-determines payment status based on amount paid.
 */
export const UpdateServicePaymentModal: React.FC<UpdateServicePaymentModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>(
    order.payment.method
  );
  const [amountPaid, setAmountPaid] = useState<string>(
    order.payment.amountPaid.toString()
  );

  const updatePaymentMutation = useUpdateServicePayment();

  // Calculate balance
  const totalDue = order.totalAmount;
  const currentAmountPaid = parseFloat(amountPaid) || 0;
  const balance = totalDue - currentAmountPaid;
  const change = currentAmountPaid > totalDue ? currentAmountPaid - totalDue : 0;

  // Auto-determine payment status based on amount
  const derivedPaymentStatus = useMemo((): ServicePaymentStatus => {
    if (currentAmountPaid >= totalDue) {
      return 'paid';
    } else if (currentAmountPaid > 0) {
      return 'partial';
    }
    return 'pending';
  }, [currentAmountPaid, totalDue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updatePaymentMutation.mutateAsync({
        orderId: order._id,
        payload: {
          paymentMethod: paymentMethod,
          amountPaid: currentAmountPaid,
        },
      });

      onClose();
    } catch (error) {
      console.error('Failed to update payment:', error);
    }
  };

  const handleClose = () => {
    // Reset to original values
    setPaymentMethod(order.payment.method);
    setAmountPaid(order.payment.amountPaid.toString());
    onClose();
  };

  // Quick amount buttons
  const quickAmounts = [
    { label: 'Exact', amount: totalDue },
    { label: '₱100', amount: 100 },
    { label: '₱500', amount: 500 },
    { label: '₱1000', amount: 1000 },
  ];

  if (!isOpen) return null;

  // Don't allow payment updates for cancelled orders
  const isPaymentLocked = order.status === 'cancelled';

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
              Update Payment
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
            {/* Order Summary */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Job Number</span>
                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                  {order.jobNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Total Due</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(totalDue)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Current Status</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(order.payment.status)}`}
                >
                  {SERVICE_PAYMENT_STATUS_OPTIONS.find(opt => opt.value === order.payment.status)?.label || order.payment.status}
                </span>
              </div>
            </div>

            {isPaymentLocked ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  Payment cannot be updated for cancelled orders.
                </p>
              </div>
            ) : (
              <>
                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPaymentMethod(option.value as PaymentMethod)}
                        className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          paymentMethod === option.value
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount Paid */}
                <div>
                  <label
                    htmlFor="amount-paid"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Amount Paid
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="amount-paid"
                      type="number"
                      step="0.01"
                      min="0"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="flex items-center gap-2 mt-2">
                    {quickAmounts.map((qa) => (
                      <button
                        key={qa.label}
                        type="button"
                        onClick={() => setAmountPaid(qa.amount.toString())}
                        className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Balance / Change Display */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                  {change > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Change</span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(change)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Balance Due</span>
                      <span
                        className={`text-lg font-bold ${
                          balance > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {formatCurrency(Math.max(0, balance))}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">New Status</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(derivedPaymentStatus)}`}
                    >
                      {SERVICE_PAYMENT_STATUS_OPTIONS.find(opt => opt.value === derivedPaymentStatus)?.label || derivedPaymentStatus}
                    </span>
                  </div>
                </div>

                {/* Info note for completed orders */}
                {order.status === 'completed' && derivedPaymentStatus === 'paid' && order.payment.status !== 'paid' && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      <strong>Note:</strong> Since this service is completed, marking it as paid will finalize the transaction.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              {!isPaymentLocked && (
                <Button
                  type="submit"
                  disabled={updatePaymentMutation.isPending}
                  isLoading={updatePaymentMutation.isPending}
                >
                  Update Payment
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdateServicePaymentModal;
