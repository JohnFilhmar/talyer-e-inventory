'use client';

import React, { useState } from 'react';
import { X, Search, Plus, Minus, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useUpdateParts } from '@/hooks/useServices';
import { useProductSearch } from '@/hooks/useProducts';
import {
  ServiceOrder,
  PartUsed,
  isPopulatedPartProduct,
} from '@/types/service';
import type { ProductSearchResult } from '@/types/product';

interface UpdatePartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ServiceOrder;
}

interface PartEntry {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
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
 * Convert existing parts to PartEntry format
 */
function partsToEntries(parts: PartUsed[]): PartEntry[] {
  return parts.map((part) => ({
    productId: isPopulatedPartProduct(part.product) ? part.product._id : (part.product as string),
    sku: part.sku,
    name: part.name,
    quantity: part.quantity,
    unitPrice: part.unitPrice,
  }));
}

/**
 * UpdatePartsModal component
 *
 * Modal for managing parts used in a service order.
 * Supports adding new parts, adjusting quantities, and removing parts.
 * Shows stock availability and calculates totals.
 */
export const UpdatePartsModal: React.FC<UpdatePartsModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  // Track the order key to detect when we need to reinitialize
  const orderKey = `${order._id}-${order.partsUsed.length}`;
  const [lastOrderKey, setLastOrderKey] = useState(orderKey);
  
  // Initialize parts from order - reinitialize when order changes
  const [parts, setParts] = useState<PartEntry[]>(() => partsToEntries(order.partsUsed));
  const [productSearch, setProductSearch] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Reinitialize when order changes (declarative pattern)
  if (isOpen && lastOrderKey !== orderKey) {
    setLastOrderKey(orderKey);
    setParts(partsToEntries(order.partsUsed));
  }

  const updatePartsMutation = useUpdateParts();
  const { data: searchResults, isLoading: searchLoading } = useProductSearch(
    productSearch,
    10
  );

  // Calculate totals
  const totalPartsAmount = parts.reduce(
    (sum, part) => sum + part.quantity * part.unitPrice,
    0
  );

  const handleAddPart = (product: ProductSearchResult) => {
    // Check if part already exists
    const existingIndex = parts.findIndex((p) => p.productId === product._id);
    
    if (existingIndex >= 0) {
      // Increment quantity
      const newParts = [...parts];
      newParts[existingIndex].quantity += 1;
      setParts(newParts);
    } else {
      // Add new part
      setParts([
        ...parts,
        {
          productId: product._id,
          sku: product.sku,
          name: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice || 0,
        },
      ]);
    }
    
    setProductSearch('');
    setShowSearchDropdown(false);
  };

  const handleQuantityChange = (index: number, delta: number) => {
    const newParts = [...parts];
    const newQuantity = newParts[index].quantity + delta;
    
    if (newQuantity <= 0) {
      // Remove part
      newParts.splice(index, 1);
    } else {
      newParts[index].quantity = newQuantity;
    }
    
    setParts(newParts);
  };

  const handleQuantityInput = (index: number, value: string) => {
    const quantity = parseInt(value, 10);
    if (isNaN(quantity) || quantity < 0) return;
    
    const newParts = [...parts];
    if (quantity === 0) {
      newParts.splice(index, 1);
    } else {
      newParts[index].quantity = quantity;
    }
    setParts(newParts);
  };

  const handleRemovePart = (index: number) => {
    const newParts = [...parts];
    newParts.splice(index, 1);
    setParts(newParts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updatePartsMutation.mutateAsync({
        orderId: order._id,
        payload: {
          partsUsed: parts.map((part) => ({
            product: part.productId,
            quantity: part.quantity,
          })),
        },
      });

      onClose();
    } catch (error) {
      console.error('Failed to update parts:', error);
    }
  };

  const handleClose = () => {
    setParts(partsToEntries(order.partsUsed));
    setProductSearch('');
    setShowSearchDropdown(false);
    onClose();
  };

  if (!isOpen) return null;

  // Don't allow updates for completed or cancelled orders
  const isUpdateLocked = order.status === 'completed' || order.status === 'cancelled';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl transform rounded-lg bg-white dark:bg-gray-900 shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Manage Parts Used
                </h2>
                <p className="text-sm text-gray-500">
                  Job #{order.jobNumber}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {isUpdateLocked ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  Parts cannot be updated for {order.status} orders.
                </p>
              </div>
            ) : (
              <>
                {/* Product Search */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Add Parts
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowSearchDropdown(true);
                      }}
                      onFocus={() => setShowSearchDropdown(true)}
                      placeholder="Search products by name or SKU..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Search Results Dropdown */}
                  {showSearchDropdown && productSearch.length >= 2 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-48 overflow-auto">
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
                            onClick={() => handleAddPart(product)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {product.name}
                                </p>
                                <p className="text-sm text-gray-500">
                                  SKU: {product.sku}
                                </p>
                              </div>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(product.sellingPrice || 0)}
                              </span>
                            </div>
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

                {/* Parts List */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Parts ({parts.length})
                  </label>
                  {parts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No parts added yet</p>
                      <p className="text-sm">Search and add parts above</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto">
                      {parts.map((part, index) => (
                        <div
                          key={part.productId}
                          className="flex items-center justify-between p-3 gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {part.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              SKU: {part.sku} • {formatCurrency(part.unitPrice)} each
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg">
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(index, -1)}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-l-lg"
                              >
                                <Minus className="w-4 h-4 text-gray-500" />
                              </button>
                              <input
                                type="number"
                                value={part.quantity}
                                onChange={(e) => handleQuantityInput(index, e.target.value)}
                                min={1}
                                className="w-12 text-center text-sm py-1 border-x border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100"
                              />
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(index, 1)}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-r-lg"
                              >
                                <Plus className="w-4 h-4 text-gray-500" />
                              </button>
                            </div>
                            <span className="w-24 text-right font-medium text-gray-900 dark:text-gray-100">
                              {formatCurrency(part.quantity * part.unitPrice)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemovePart(index)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Total Parts Cost
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(totalPartsAmount)}
                    </span>
                  </div>
                  {order.laborCost > 0 && (
                    <div className="flex items-center justify-between mt-1 text-sm">
                      <span className="text-gray-500">Labor Cost</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        + {formatCurrency(order.laborCost)}
                      </span>
                    </div>
                  )}
                  {order.otherCharges > 0 && (
                    <div className="flex items-center justify-between mt-1 text-sm">
                      <span className="text-gray-500">Other Charges</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        + {formatCurrency(order.otherCharges)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Estimated Total
                    </span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(totalPartsAmount + order.laborCost + order.otherCharges)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              {!isUpdateLocked && (
                <Button
                  type="submit"
                  disabled={updatePartsMutation.isPending}
                  isLoading={updatePartsMutation.isPending}
                >
                  Update Parts
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdatePartsModal;
