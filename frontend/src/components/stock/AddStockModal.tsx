'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Package, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { createStockSchema, type CreateStockFormData } from '@/utils/validators/stock';
import { useProductSearch } from '@/hooks/useProducts';
import type { Branch } from '@/types/branch';
import type { Supplier } from '@/types/supplier';
import type { ProductSearchResult } from '@/types/product';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: Branch[];
  suppliers: Supplier[];
  onSubmit: (data: CreateStockFormData) => Promise<void>;
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
 * AddStockModal component
 * 
 * Modal for adding a product to stock at a specific branch.
 * Creates a new stock record or updates existing if product+branch exists.
 */
export const AddStockModal: React.FC<AddStockModalProps> = ({
  isOpen,
  onClose,
  branches,
  suppliers,
  onSubmit,
  isLoading = false,
  error,
}) => {
  // Product search state
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Use debounced product search
  const { data: searchResults, isLoading: searchLoading } = useProductSearch(
    productSearch,
    10
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateStockFormData>({
    resolver: zodResolver(createStockSchema),
    defaultValues: {
      product: '',
      branch: '',
      quantity: 1,
      costPrice: 0,
      sellingPrice: 0,
      reorderPoint: 10,
      reorderQuantity: 20,
      supplier: '',
      location: '',
    },
  });

  // Watch form values for calculations
  const quantity = watch('quantity');
  const costPrice = watch('costPrice');
  const sellingPrice = watch('sellingPrice');

  // Calculate totals
  const totalCost = (quantity || 0) * (costPrice || 0);
  const profitMargin = sellingPrice && costPrice && costPrice > 0
    ? ((sellingPrice - costPrice) / costPrice * 100).toFixed(1)
    : '0';

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      reset();
      setProductSearch('');
      setSelectedProduct(null);
      setShowProductDropdown(false);
    }
  }, [isOpen, reset]);

  // Handle product selection
  const handleSelectProduct = (product: ProductSearchResult) => {
    setSelectedProduct(product);
    setValue('product', product._id);
    // Pre-fill selling price from product if available
    if (product.sellingPrice) {
      setValue('sellingPrice', product.sellingPrice);
    }
    setProductSearch('');
    setShowProductDropdown(false);
  };

  // Handle form submission
  const handleFormSubmit = async (data: CreateStockFormData) => {
    try {
      await onSubmit(data);
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  // Filter out empty supplier value
  const handleBeforeSubmit = (data: CreateStockFormData) => {
    const cleanedData = {
      ...data,
      supplier: data.supplier || undefined,
      location: data.location || undefined,
    };
    return handleFormSubmit(cleanedData);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Package className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Add Stock
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Add a product to branch inventory
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
        {error && (
          <Alert variant="error" className="mb-4">
            {error.message}
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(handleBeforeSubmit)} className="space-y-4">
          {/* Product Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Product <span className="text-red-500">*</span>
            </label>
            {selectedProduct ? (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedProduct.name}
                  </p>
                  <p className="text-sm text-gray-500">SKU: {selectedProduct.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setValue('product', '');
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setShowProductDropdown(true);
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="Search by product name or SKU..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
                
                {/* Search Results Dropdown */}
                {showProductDropdown && productSearch.length >= 2 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto">
                    {searchLoading ? (
                      <div className="p-4 text-center">
                        <Spinner size="sm" />
                        <span className="ml-2 text-gray-500">Searching...</span>
                      </div>
                    ) : searchResults && searchResults.length > 0 ? (
                      searchResults.map((product) => (
                        <button
                          key={product._id}
                          type="button"
                          onClick={() => handleSelectProduct(product)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                        >
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {product.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            SKU: {product.sku}
                            {product.sellingPrice && ` • Price: ${formatPrice(product.sellingPrice)}`}
                          </p>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        No products found
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <input type="hidden" {...register('product')} />
            {errors.product && (
              <p className="mt-1 text-sm text-red-500">{errors.product.message}</p>
            )}
          </div>

          {/* Branch Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Branch <span className="text-red-500">*</span>
            </label>
            <select
              {...register('branch')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            >
              <option value="">Select a branch</option>
              {branches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
            {errors.branch && (
              <p className="mt-1 text-sm text-red-500">{errors.branch.message}</p>
            )}
          </div>

          {/* Quantity & Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quantity <span className="text-red-500">*</span>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location (optional)
              </label>
              <input
                type="text"
                {...register('location')}
                placeholder="e.g., Aisle 3, Shelf B"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cost Price (₱) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                {...register('costPrice', { valueAsNumber: true })}
                min={0}
                step={0.01}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
              {errors.costPrice && (
                <p className="mt-1 text-sm text-red-500">{errors.costPrice.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Selling Price (₱) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                {...register('sellingPrice', { valueAsNumber: true })}
                min={0}
                step={0.01}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
              {errors.sellingPrice && (
                <p className="mt-1 text-sm text-red-500">{errors.sellingPrice.message}</p>
              )}
            </div>
          </div>

          {/* Reorder Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reorder Point
              </label>
              <input
                type="number"
                {...register('reorderPoint', { valueAsNumber: true })}
                min={0}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">Alert when stock falls below this</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reorder Quantity
              </label>
              <input
                type="number"
                {...register('reorderQuantity', { valueAsNumber: true })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">Suggested order quantity</p>
            </div>
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Supplier (optional)
            </label>
            <select
              {...register('supplier')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            >
              <option value="">No supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name} {supplier.code && `(${supplier.code})`}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          {selectedProduct && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Summary</h4>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Cost:</span>
                <span className="font-medium">{formatPrice(totalCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Profit Margin:</span>
                <span className={`font-medium ${Number(profitMargin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {profitMargin}%
                </span>
              </div>
            </div>
          )}

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
              disabled={isLoading || !selectedProduct}
            >
              {isLoading ? 'Adding...' : 'Add Stock'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default AddStockModal;
