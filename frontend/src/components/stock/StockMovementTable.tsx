'use client';

import React from 'react';
import { Clock, User, FileText, ExternalLink } from 'lucide-react';
import { StockMovementBadge } from './StockMovementBadge';
import {
  StockMovement,
  isPopulatedStockProduct,
  isPopulatedStockBranch,
  isPopulatedMovementUser,
  isPopulatedSupplier,
} from '@/types/stock';

interface StockMovementTableProps {
  movements: StockMovement[];
  isLoading?: boolean;
  showProduct?: boolean;
  showBranch?: boolean;
}

/**
 * Format date/time for display
 */
function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

/**
 * Format quantity with sign
 */
function formatQuantity(quantity: number): { text: string; className: string } {
  if (quantity > 0) {
    return { text: `+${quantity}`, className: 'text-green-600 dark:text-green-400' };
  } else if (quantity < 0) {
    return { text: `${quantity}`, className: 'text-red-600 dark:text-red-400' };
  }
  return { text: '0', className: 'text-gray-500' };
}

/**
 * StockMovementTable component
 * 
 * Displays a table of stock movement history records
 */
export const StockMovementTable: React.FC<StockMovementTableProps> = ({
  movements,
  isLoading = false,
  showProduct = true,
  showBranch = true,
}) => {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
        ))}
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No movement history</p>
        <p className="text-sm">Stock changes will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {movements.map((movement) => {
        const productName = isPopulatedStockProduct(movement.product)
          ? movement.product.name
          : 'Unknown Product';
        const productSku = isPopulatedStockProduct(movement.product)
          ? movement.product.sku
          : '';
        const branchName = isPopulatedStockBranch(movement.branch)
          ? movement.branch.name
          : 'Unknown Branch';
        const userName = isPopulatedMovementUser(movement.performedBy)
          ? movement.performedBy.name
          : 'Unknown User';
        const supplierName = movement.supplier && isPopulatedSupplier(movement.supplier)
          ? movement.supplier.name
          : null;

        const qty = formatQuantity(movement.quantity);

        return (
          <div
            key={movement._id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            {/* Header Row */}
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <StockMovementBadge type={movement.type} />
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {movement.movementId}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="w-3 h-3" />
                {formatDateTime(movement.createdAt)}
              </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Product & Branch */}
              <div className="space-y-1">
                {showProduct && (
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {productName}
                    </span>
                    {productSku && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {productSku}
                      </span>
                    )}
                  </div>
                )}
                {showBranch && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {branchName}
                  </div>
                )}
              </div>

              {/* Quantity Change */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Before</div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {movement.quantityBefore}
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${qty.className}`}>
                    {qty.text}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">After</div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {movement.quantityAfter}
                  </div>
                </div>
              </div>

              {/* User & Details */}
              <div className="space-y-1 text-right">
                <div className="flex items-center justify-end gap-1 text-sm text-gray-700 dark:text-gray-300">
                  <User className="w-3 h-3" />
                  {userName}
                </div>
                {supplierName && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Supplier: {supplierName}
                  </div>
                )}
                {movement.reference && (
                  <div className="flex items-center justify-end gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <ExternalLink className="w-3 h-3" />
                    {movement.reference.type}
                  </div>
                )}
              </div>
            </div>

            {/* Reason & Notes */}
            {(movement.reason || movement.notes) && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                {movement.reason && (
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Reason:</span> {movement.reason}
                    </span>
                  </div>
                )}
                {movement.notes && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                    {movement.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StockMovementTable;
