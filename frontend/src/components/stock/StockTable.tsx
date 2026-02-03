'use client';

import React from 'react';
import Link from 'next/link';
import {
  Package,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronUp,
  ChevronDown,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Stock, isPopulatedStockProduct, isPopulatedStockBranch } from '@/types/stock';

interface StockTableProps {
  stocks: Stock[];
  isLoading?: boolean;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
  onRestock: (stock: Stock) => void;
  onAdjust: (stock: Stock) => void;
  onHistory: (stock: Stock) => void;
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
 * Get stock status based on quantity and reorder point
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

interface SortHeaderProps {
  field: string;
  label: string;
  currentSort: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
}

const SortHeader: React.FC<SortHeaderProps> = ({
  field,
  label,
  currentSort,
  sortOrder,
  onSort,
  align = 'left',
}) => {
  const isActive = currentSort === field;
  const alignClass = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
  }[align];

  return (
    <th
      className={`px-6 py-3 ${alignClass} text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          sortOrder === 'asc' ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )
        ) : (
          <span className="w-4 h-4" />
        )}
      </span>
    </th>
  );
};

/**
 * StockTable component
 * 
 * Displays stock items in a sortable table with actions.
 */
export const StockTable: React.FC<StockTableProps> = ({
  stocks,
  isLoading = false,
  sortField,
  sortOrder,
  onSortChange,
  onRestock,
  onAdjust,
  onHistory,
  isAdmin = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <Spinner size="lg" />
          <span className="ml-2 text-gray-500">Loading stock data...</span>
        </div>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-12">
        <div className="text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No stock found
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Try adjusting your filters or add stock to your products.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <SortHeader
                field="product.name"
                label="Product"
                currentSort={sortField}
                sortOrder={sortOrder}
                onSort={onSortChange}
              />
              <SortHeader
                field="branch.name"
                label="Branch"
                currentSort={sortField}
                sortOrder={sortOrder}
                onSort={onSortChange}
              />
              <SortHeader
                field="quantity"
                label="Qty"
                currentSort={sortField}
                sortOrder={sortOrder}
                onSort={onSortChange}
                align="right"
              />
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Reserved
              </th>
              <SortHeader
                field="available"
                label="Available"
                currentSort={sortField}
                sortOrder={sortOrder}
                onSort={onSortChange}
                align="right"
              />
              <SortHeader
                field="sellingPrice"
                label="Price"
                currentSort={sortField}
                sortOrder={sortOrder}
                onSort={onSortChange}
                align="right"
              />
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              {isAdmin && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {stocks.map((stock) => {
              const productName = isPopulatedStockProduct(stock.product)
                ? stock.product.name
                : 'Unknown Product';
              const productId = isPopulatedStockProduct(stock.product)
                ? stock.product._id
                : String(stock.product);
              const productSku = isPopulatedStockProduct(stock.product)
                ? stock.product.sku
                : '';
              const branchName = isPopulatedStockBranch(stock.branch)
                ? stock.branch.name
                : 'Unknown Branch';
              
              const available = stock.quantity - stock.reservedQuantity;
              const status = getStockStatus(stock.quantity, available, stock.reorderPoint);
              const StatusIcon = status.icon;

              return (
                <tr
                  key={stock._id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/products/${productId}`}
                      className="hover:text-yellow-600 dark:hover:text-yellow-400"
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {productName}
                      </div>
                      {productSku && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          SKU: {productSku}
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-900 dark:text-gray-100">
                    {branchName}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-gray-100">
                    {stock.quantity}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-500 dark:text-gray-400">
                    {stock.reservedQuantity}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-gray-100">
                    {available}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900 dark:text-gray-100">
                    {formatPrice(stock.sellingPrice)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant={status.variant} size="sm">
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {status.label}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onHistory(stock)}
                          title="View history"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRestock(stock)}
                          title="Add stock"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAdjust(stock)}
                          title="Adjust stock"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden divide-y divide-gray-200 dark:divide-gray-700">
        {stocks.map((stock) => {
          const productName = isPopulatedStockProduct(stock.product)
            ? stock.product.name
            : 'Unknown Product';
          const productId = isPopulatedStockProduct(stock.product)
            ? stock.product._id
            : String(stock.product);
          const productSku = isPopulatedStockProduct(stock.product)
            ? stock.product.sku
            : '';
          const branchName = isPopulatedStockBranch(stock.branch)
            ? stock.branch.name
            : 'Unknown Branch';
          
          const available = stock.quantity - stock.reservedQuantity;
          const status = getStockStatus(stock.quantity, available, stock.reorderPoint);
          const StatusIcon = status.icon;

          return (
            <div key={stock._id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <Link
                  href={`/products/${productId}`}
                  className="hover:text-yellow-600 dark:hover:text-yellow-400"
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {productName}
                  </div>
                  {productSku && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      SKU: {productSku}
                    </div>
                  )}
                </Link>
                <Badge variant={status.variant} size="sm">
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {status.label}
                </Badge>
              </div>
              
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {branchName}
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Qty:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                    {stock.quantity}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Available:</span>
                  <span className="ml-1 font-semibold text-gray-900 dark:text-gray-100">
                    {available}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Price:</span>
                  <span className="ml-1 text-gray-900 dark:text-gray-100">
                    {formatPrice(stock.sellingPrice)}
                  </span>
                </div>
              </div>

              {isAdmin && (
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onHistory(stock)}
                    title="View history"
                  >
                    <History className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => onRestock(stock)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Restock
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => onAdjust(stock)}
                  >
                    <Minus className="w-4 h-4 mr-1" />
                    Adjust
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StockTable;
