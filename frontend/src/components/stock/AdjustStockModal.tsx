'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import {
  adjustStockSchema,
  type AdjustStockFormData,
} from '@/utils/validators/stock';
import {
  Stock,
  ADJUSTMENT_REASONS,
  isPopulatedStockProduct,
  isPopulatedStockBranch,
} from '@/types/stock';

interface AdjustStockModalProps {
  isOpen: boolean;
  stock: Stock | null;
  onClose: () => void;
  onAdjust: (stockId: string, data: AdjustStockFormData) => Promise<void>;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * AdjustStockModal component
 * 
 * Modal for adjusting (usually reducing) stock with reason tracking.
 * Used for corrections, damage, returns, etc.
 */
export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  isOpen,
  stock,
  onClose,
  onAdjust,
  isLoading = false,
  error,
}) => {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AdjustStockFormData>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: {
      quantity: 0,
      reason: 'correction',
      notes: '',
    },
  });

  // Reset form when modal opens/closes or stock changes
  useEffect(() => {
    if (isOpen && stock) {
      reset({
        quantity: 0,
        reason: 'correction',
        notes: '',
      });
      setSubmitError(null);
    }
  }, [isOpen, stock, reset]);

  const quantity = watch('quantity');
  const currentQty = stock?.quantity ?? 0;
  const newQty = currentQty + (quantity || 0);

  const onSubmit = async (data: AdjustStockFormData) => {
    if (!stock) return;

    // Validate the adjustment won't result in negative stock
    if (newQty < 0) {
      setSubmitError(`Cannot reduce stock below 0. Current stock: ${currentQty}`);
      return;
    }

    try {
      setSubmitError(null);
      await onAdjust(stock._id, {
        ...data,
        notes: data.notes || undefined,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to adjust stock');
    }
  };

  if (!stock) return null;

  const productName = isPopulatedStockProduct(stock.product)
    ? stock.product.name
    : 'Unknown Product';
  const productSku = isPopulatedStockProduct(stock.product)
    ? stock.product.sku
    : '';
  const branchName = isPopulatedStockBranch(stock.branch)
    ? stock.branch.name
    : 'Unknown Branch';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Adjust Stock
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Modify inventory with reason tracking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Product Info */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
          <div className="font-medium text-gray-900 dark:text-gray-100">{productName}</div>
          {productSku && (
            <div className="text-sm text-gray-500 dark:text-gray-400">SKU: {productSku}</div>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Branch: {branchName} • Current Stock: {stock.quantity}
          </div>
        </div>

        {/* Error Display */}
        {(error || submitError) && (
          <Alert variant="error" className="mb-4">
            {error?.message || submitError}
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Adjustment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Adjustment Type <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="adjustType"
                  value="decrease"
                  checked={(quantity || 0) <= 0}
                  onChange={() => setValue('quantity', -Math.abs(quantity || 1))}
                  className="w-4 h-4 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">Decrease</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="adjustType"
                  value="increase"
                  checked={(quantity || 0) > 0}
                  onChange={() => setValue('quantity', Math.abs(quantity || 1))}
                  className="w-4 h-4 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">Increase</span>
              </label>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              {...register('quantity', { valueAsNumber: true })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            />
            {errors.quantity && (
              <p className="mt-1 text-sm text-red-500">{errors.quantity.message}</p>
            )}
          </div>

          {/* Stock Preview */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Current Stock</span>
              <span className="text-gray-900 dark:text-gray-100">{currentQty}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Adjustment</span>
              <span className={`font-medium ${(quantity || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(quantity || 0) >= 0 ? '+' : ''}{quantity || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400">New Stock</span>
              <span className={`font-semibold ${newQty < 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                {newQty}
              </span>
            </div>
          </div>

          {newQty < 0 && (
            <Alert variant="error">
              The resulting stock cannot be negative.
            </Alert>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              {...register('reason')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            >
              {ADJUSTMENT_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p className="mt-1 text-sm text-red-500">{errors.reason.message}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Add any notes about this adjustment..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={isLoading || newQty < 0}
            >
              {isLoading ? 'Adjusting...' : 'Apply Adjustment'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default AdjustStockModal;
