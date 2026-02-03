'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Package, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useLowStock } from '@/hooks/useStock';
import {
  Stock,
  isPopulatedStockProduct,
  isPopulatedStockBranch,
} from '@/types/stock';

interface LowStockAlertProps {
  /** Maximum number of items to show */
  maxItems?: number;
  /** Show compact version (sidebar) */
  compact?: boolean;
  /** Show link to full low stock list */
  showViewAll?: boolean;
}

/**
 * LowStockAlert component
 * 
 * Displays a list of low stock items. Can be used in sidebar
 * or dashboard to show inventory alerts.
 */
export const LowStockAlert: React.FC<LowStockAlertProps> = ({
  maxItems = 5,
  compact = false,
  showViewAll = true,
}) => {
  const { data, isLoading, error } = useLowStock({ limit: maxItems });
  
  // Extract items from paginated response
  const items = data && 'data' in data ? data.data : [];
  const totalCount = data && 'pagination' in data ? data.pagination?.total : items.length;

  if (isLoading) {
    return (
      <div className={`${compact ? 'p-3' : 'p-4'} flex items-center justify-center`}>
        <Spinner size="sm" />
        <span className="ml-2 text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error) {
    return null; // Silently fail in sidebar/dashboard context
  }

  if (items.length === 0) {
    return (
      <div className={`${compact ? 'p-3' : 'p-4'} text-center`}>
        <Package className="w-8 h-8 text-green-500 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All stock levels are healthy
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="p-2">
        {/* Header */}
        <div className="flex items-center justify-between px-2 mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Low Stock
            </span>
          </div>
          <Badge variant="warning" size="sm">
            {totalCount}
          </Badge>
        </div>

        {/* Items */}
        <div className="space-y-1">
          {items.slice(0, maxItems).map((stock: Stock) => {
            const productName = isPopulatedStockProduct(stock.product)
              ? stock.product.name
              : 'Unknown';
            const branchName = isPopulatedStockBranch(stock.branch)
              ? stock.branch.name
              : '';
            const available = stock.quantity - stock.reservedQuantity;

            return (
              <Link
                key={stock._id}
                href={`/stock?product=${typeof stock.product === 'string' ? stock.product : stock.product._id}`}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {productName}
                  </div>
                  {branchName && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {branchName}
                    </div>
                  )}
                </div>
                <div className="ml-2 text-sm font-semibold text-orange-600 dark:text-orange-400">
                  {available}
                </div>
              </Link>
            );
          })}
        </div>

        {/* View All Link */}
        {showViewAll && totalCount && totalCount > maxItems && (
          <Link
            href="/stock?lowStock=true"
            className="flex items-center justify-center gap-1 mt-2 px-2 py-1.5 text-sm text-yellow-600 dark:text-yellow-400 hover:underline"
          >
            View all {totalCount} items
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    );
  }

  // Full card version
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Low Stock Alert
          </h3>
          <Badge variant="warning">
            {totalCount} item{totalCount !== 1 ? 's' : ''}
          </Badge>
        </div>
        {showViewAll && (
          <Link
            href="/stock?lowStock=true"
            className="text-sm text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 flex items-center gap-1"
          >
            View All
            <ExternalLink className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {items.slice(0, maxItems).map((stock: Stock) => {
          const productName = isPopulatedStockProduct(stock.product)
            ? stock.product.name
            : 'Unknown';
          const productSku = isPopulatedStockProduct(stock.product)
            ? stock.product.sku
            : '';
          const branchName = isPopulatedStockBranch(stock.branch)
            ? stock.branch.name
            : 'Unknown Branch';
          const available = stock.quantity - stock.reservedQuantity;
          const isOutOfStock = stock.quantity === 0;

          return (
            <div
              key={stock._id}
              className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {productName}
                    </span>
                    {isOutOfStock && (
                      <Badge variant="error" size="sm">Out of Stock</Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {productSku && <span>SKU: {productSku} • </span>}
                    {branchName}
                  </div>
                </div>
                <div className="ml-4 text-right">
                  <div className={`text-lg font-semibold ${isOutOfStock ? 'text-red-600' : 'text-orange-600 dark:text-orange-400'}`}>
                    {available}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    available
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
                <span>Reorder Point: {stock.reorderPoint}</span>
                <span className="mx-2">•</span>
                <span>Total: {stock.quantity}</span>
                {stock.reservedQuantity > 0 && (
                  <>
                    <span className="mx-2">•</span>
                    <span>Reserved: {stock.reservedQuantity}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with action */}
      {showViewAll && totalCount && totalCount > maxItems && (
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <Link
            href="/stock?lowStock=true"
            className="text-sm text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 font-medium flex items-center justify-center gap-1"
          >
            View all {totalCount} low stock items
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
};

export default LowStockAlert;
