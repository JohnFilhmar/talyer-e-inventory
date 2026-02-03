'use client';

import React from 'react';
import Link from 'next/link';
import {
  Package,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { useStockByProduct } from '@/hooks/useStock';
import { isPopulatedStockBranch } from '@/types/stock';

interface ProductBranchStockProps {
  productId: string;
  /** Product name for display in empty state */
  productName?: string;
  onRestock?: (branchId: string, branchName: string) => void;
  isAdmin?: boolean;
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
 * Get status badge based on stock levels
 */
function getStockStatus(quantity: number, available: number, reorderPoint: number) {
  if (quantity === 0) {
    return { label: 'Out of Stock', variant: 'error' as const, icon: XCircle };
  }
  if (available <= reorderPoint) {
    return { label: 'Low Stock', variant: 'warning' as const, icon: AlertTriangle };
  }
  return { label: 'In Stock', variant: 'success' as const, icon: CheckCircle };
}

/**
 * ProductBranchStock component
 * 
 * Displays stock information for a product across all branches.
 * Shows quantity, reserved, available, price, and status for each branch.
 */
export const ProductBranchStock: React.FC<ProductBranchStockProps> = ({
  productId,
  // productName can be used for empty state messaging in the future
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  productName,
  onRestock,
  isAdmin = false,
}) => {
  const { data, isLoading, error } = useStockByProduct(productId);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
          <span className="ml-2 text-gray-500">Loading stock information...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <Alert variant="error" title="Error loading stock">
          {error.message}
        </Alert>
      </div>
    );
  }

  const branches = data?.branches ?? [];
  const totalQuantity = data?.totalQuantity ?? 0;
  const totalAvailable = data?.totalAvailable ?? 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Stock by Branch
          </h3>
          {branches.length > 0 && (
            <Badge variant="secondary" size="sm">
              {branches.length} branch{branches.length !== 1 ? 'es' : ''}
            </Badge>
          )}
        </div>
        <Link
          href="/stock"
          className="text-sm text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300 flex items-center gap-1"
        >
          Manage Stock
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Content */}
      {branches.length === 0 ? (
        /* Empty State */
        <div className="px-6 py-12 text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No Stock Records
          </h4>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            This product is not stocked in any branch yet.
          </p>
          {isAdmin && onRestock && (
            <Button variant="primary" onClick={() => onRestock('', '')}>
              <Plus className="w-4 h-4 mr-2" />
              Add Stock
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Table - Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Branch
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Reserved
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Available
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  {isAdmin && onRestock && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {branches.map((item) => {
                  const branchName = isPopulatedStockBranch(item.branch)
                    ? item.branch.name
                    : 'Unknown Branch';
                  const branchId = isPopulatedStockBranch(item.branch)
                    ? item.branch._id
                    : String(item.branch);
                  const status = getStockStatus(item.quantity, item.available, item.reorderPoint);
                  const StatusIcon = status.icon;

                  return (
                    <tr
                      key={branchId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {branchName}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 dark:text-gray-100">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-gray-500 dark:text-gray-400">
                        {item.reservedQuantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900 dark:text-gray-100">
                        {item.available}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 dark:text-gray-100">
                        {formatPrice(item.sellingPrice)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant={status.variant} size="sm">
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {status.label}
                        </Badge>
                      </td>
                      {isAdmin && onRestock && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRestock(branchId, branchName)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Restock
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* Summary Row */}
                <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-100">
                    TOTAL
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 dark:text-gray-100">
                    {totalQuantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-500 dark:text-gray-400">
                    —
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 dark:text-gray-100">
                    {totalAvailable}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-500 dark:text-gray-400">
                    —
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    —
                  </td>
                  {isAdmin && onRestock && <td className="px-6 py-4"></td>}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Cards - Mobile */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {branches.map((item) => {
              const branchName = isPopulatedStockBranch(item.branch)
                ? item.branch.name
                : 'Unknown Branch';
              const branchId = isPopulatedStockBranch(item.branch)
                ? item.branch._id
                : String(item.branch);
              const status = getStockStatus(item.quantity, item.available, item.reorderPoint);
              const StatusIcon = status.icon;

              return (
                <div key={branchId} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {branchName}
                    </span>
                    <Badge variant={status.variant} size="sm">
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Quantity:</span>
                      <span className="ml-1 text-gray-900 dark:text-gray-100">{item.quantity}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Available:</span>
                      <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                        {item.available}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Reserved:</span>
                      <span className="ml-1 text-gray-900 dark:text-gray-100">
                        {item.reservedQuantity}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Price:</span>
                      <span className="ml-1 text-gray-900 dark:text-gray-100">
                        {formatPrice(item.sellingPrice)}
                      </span>
                    </div>
                  </div>
                  {isAdmin && onRestock && (
                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => onRestock(branchId, branchName)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Restock
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Summary Card */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900 dark:text-gray-100">TOTAL</span>
                <div className="text-right">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Quantity: <span className="font-semibold text-gray-900 dark:text-gray-100">{totalQuantity}</span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Available: <span className="font-semibold text-gray-900 dark:text-gray-100">{totalAvailable}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProductBranchStock;
