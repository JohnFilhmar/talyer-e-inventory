'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import { createTransferSchema, type CreateTransferFormData } from '@/utils/validators/stock';
import type { Branch } from '@/types/branch';
import type { Stock } from '@/types/stock';

interface CreateTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: Branch[];
  stocks: Stock[];
  onCreateTransfer: (data: CreateTransferFormData) => Promise<void>;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * CreateTransferModal component
 * 
 * Modal for creating a new stock transfer between branches.
 */
export const CreateTransferModal: React.FC<CreateTransferModalProps> = ({
  isOpen,
  onClose,
  branches,
  stocks,
  onCreateTransfer,
  isLoading = false,
  error,
}) => {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateTransferFormData>({
    resolver: zodResolver(createTransferSchema),
    defaultValues: {
      product: '',
      fromBranch: '',
      toBranch: '',
      quantity: 1,
      notes: '',
    },
  });

  // Watch form values
  const fromBranch = watch('fromBranch');
  const productId = watch('product');

  // Get available stock for selected product at source branch
  const selectedStock = stocks.find(
    (s) => {
      const stockProductId = typeof s.product === 'string' ? s.product : s.product._id;
      const stockBranchId = typeof s.branch === 'string' ? s.branch : s.branch._id;
      return stockProductId === productId && stockBranchId === fromBranch;
    }
  );
  
  const availableQuantity = selectedStock 
    ? selectedStock.quantity - selectedStock.reservedQuantity 
    : 0;

  // Get unique products from stock
  const uniqueProducts = stocks.reduce((acc, stock) => {
    const productId = typeof stock.product === 'string' ? stock.product : stock.product._id;
    const productName = typeof stock.product === 'string' ? 'Unknown' : stock.product.name;
    if (!acc.find((p) => p.id === productId)) {
      acc.push({ id: productId, name: productName });
    }
    return acc;
  }, [] as { id: string; name: string }[]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      reset({
        product: '',
        fromBranch: '',
        toBranch: '',
        quantity: 1,
        notes: '',
      });
      setSubmitError(null);
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: CreateTransferFormData) => {
    // Validate quantity against available
    if (data.quantity > availableQuantity) {
      setSubmitError(`Cannot transfer more than available quantity (${availableQuantity})`);
      return;
    }

    try {
      setSubmitError(null);
      await onCreateTransfer(data);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create transfer');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Truck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Create Stock Transfer
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Move inventory between branches
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

        {/* Error Display */}
        {(error || submitError) && (
          <Alert variant="error" className="mb-4">
            {error?.message || submitError}
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Product Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Product <span className="text-red-500">*</span>
            </label>
            <select
              {...register('product')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            >
              <option value="">Select a product</option>
              {uniqueProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            {errors.product && (
              <p className="mt-1 text-sm text-red-500">{errors.product.message}</p>
            )}
          </div>

          {/* Branch Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* From Branch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Branch <span className="text-red-500">*</span>
              </label>
              <select
                {...register('fromBranch')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="">Select source branch</option>
                {branches.map((branch) => (
                  <option key={branch._id} value={branch._id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              {errors.fromBranch && (
                <p className="mt-1 text-sm text-red-500">{errors.fromBranch.message}</p>
              )}
            </div>

            {/* Arrow Indicator */}
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-gray-400 mt-6" />
            </div>

            {/* To Branch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To Branch <span className="text-red-500">*</span>
              </label>
              <select
                {...register('toBranch')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="">Select destination branch</option>
                {branches
                  .filter((b) => b._id !== fromBranch)
                  .map((branch) => (
                    <option key={branch._id} value={branch._id}>
                      {branch.name}
                    </option>
                  ))}
              </select>
              {errors.toBranch && (
                <p className="mt-1 text-sm text-red-500">{errors.toBranch.message}</p>
              )}
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
              min={1}
              max={availableQuantity || undefined}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            />
            {errors.quantity && (
              <p className="mt-1 text-sm text-red-500">{errors.quantity.message}</p>
            )}
            {fromBranch && productId && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Available at source: <span className="font-medium">{availableQuantity}</span>
              </p>
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
              placeholder="Add any notes about this transfer..."
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
              disabled={isLoading || !productId || !fromBranch || availableQuantity === 0}
            >
              {isLoading ? 'Creating...' : 'Create Transfer'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default CreateTransferModal;
