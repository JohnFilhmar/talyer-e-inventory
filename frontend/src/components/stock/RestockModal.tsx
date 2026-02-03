'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Package, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import { restockSchema, type RestockFormData } from '@/utils/validators/stock';
import { Stock, isPopulatedStockProduct, isPopulatedStockBranch } from '@/types/stock';
import type { Supplier } from '@/types/supplier';

interface RestockModalProps {
  isOpen: boolean;
  stock: Stock | null;
  suppliers: Supplier[];
  onClose: () => void;
  onRestock: (stockId: string, data: RestockFormData) => Promise<void>;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * Format price in Philippine Peso
 */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * RestockModal component
 * 
 * Modal for adding stock to an existing stock record.
 * Includes quantity, cost, supplier, and notes.
 */
export const RestockModal: React.FC<RestockModalProps> = ({
  isOpen,
  stock,
  suppliers,
  onClose,
  onRestock,
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
  } = useForm<RestockFormData>({
    resolver: zodResolver(restockSchema),
    defaultValues: {
      quantity: 1,
      supplierId: '',
      notes: '',
    },
  });

  // Reset form when modal opens/closes or stock changes
  useEffect(() => {
    if (isOpen && stock) {
      reset({
        quantity: 1,
        supplierId: '',
        notes: '',
      });
      setSubmitError(null);
    }
  }, [isOpen, stock, reset]);

  const quantity = watch('quantity');

  const onSubmit = async (data: RestockFormData) => {
    if (!stock) return;
    
    try {
      setSubmitError(null);
      // Clean up data - remove empty strings
      const cleanData = {
        ...data,
        supplierId: data.supplierId || undefined,
        notes: data.notes || undefined,
      };
      await onRestock(stock._id, cleanData as RestockFormData);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to restock');
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
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Package className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Restock
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Add inventory for this product
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
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Cost: {formatPrice(stock.costPrice)} • Selling: {formatPrice(stock.sellingPrice)}
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
          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Quantity to Add <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              {...register('quantity', { valueAsNumber: true })}
              min={1}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            />
            {errors.quantity && (
              <p className="mt-1 text-sm text-red-500">{errors.quantity.message}</p>
            )}
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Supplier
            </label>
            <select
              {...register('supplierId')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            >
              <option value="">Select a supplier (optional)</option>
              {suppliers.map((supplier) => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name} ({supplier.code})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Add any notes about this restock..."
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
              disabled={isLoading}
            >
              {isLoading ? 'Adding...' : `Add ${quantity || 0} units`}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default RestockModal;
