'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  StockTransfer,
  TransferStatus,
  isPopulatedStockProduct,
  isPopulatedStockBranch,
  isPopulatedTransferUser,
} from '@/types/stock';

interface TransferListProps {
  transfers: StockTransfer[];
  isLoading?: boolean;
  onStatusUpdate?: (transferId: string, status: TransferStatus) => void;
  isUpdating?: boolean;
  showActions?: boolean;
}

/**
 * Format date
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get status badge configuration
 */
function getStatusConfig(status: TransferStatus) {
  switch (status) {
    case 'pending':
      return { label: 'Pending', variant: 'warning' as const, icon: Clock };
    case 'in-transit':
      return { label: 'In Transit', variant: 'info' as const, icon: Truck };
    case 'completed':
      return { label: 'Completed', variant: 'success' as const, icon: CheckCircle };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'error' as const, icon: XCircle };
    default:
      return { label: status, variant: 'secondary' as const, icon: Clock };
  }
}

/**
 * Get available status transitions
 */
function getAvailableTransitions(currentStatus: TransferStatus): TransferStatus[] {
  switch (currentStatus) {
    case 'pending':
      return ['in-transit', 'cancelled'];
    case 'in-transit':
      return ['completed', 'cancelled'];
    default:
      return [];
  }
}

/**
 * TransferList component
 * 
 * Displays a list of stock transfers with status and actions.
 */
export const TransferList: React.FC<TransferListProps> = ({
  transfers,
  isLoading = false,
  onStatusUpdate,
  isUpdating = false,
  showActions = true,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <Spinner size="lg" />
          <span className="ml-2 text-gray-500">Loading transfers...</span>
        </div>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-12">
        <div className="text-center">
          <Truck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No transfers found
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Create a transfer to move stock between branches.
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Transfer #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Route
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Qty
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              {showActions && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {transfers.map((transfer) => {
              const productName = isPopulatedStockProduct(transfer.product)
                ? transfer.product.name
                : 'Unknown Product';
              const productId = isPopulatedStockProduct(transfer.product)
                ? transfer.product._id
                : String(transfer.product);
              const fromBranch = isPopulatedStockBranch(transfer.fromBranch)
                ? transfer.fromBranch.name
                : 'Unknown';
              const toBranch = isPopulatedStockBranch(transfer.toBranch)
                ? transfer.toBranch.name
                : 'Unknown';
              const requestedBy = isPopulatedTransferUser(transfer.requestedBy)
                ? `${transfer.requestedBy.firstName} ${transfer.requestedBy.lastName}`
                : '';
              
              const statusConfig = getStatusConfig(transfer.status);
              const StatusIcon = statusConfig.icon;
              const availableTransitions = getAvailableTransitions(transfer.status);

              return (
                <tr
                  key={transfer._id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/stock/transfers/${transfer._id}`}
                      className="font-medium text-yellow-600 dark:text-yellow-400 hover:underline"
                    >
                      {transfer.transferNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/products/${productId}`}
                      className="text-gray-900 dark:text-gray-100 hover:text-yellow-600"
                    >
                      {productName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{fromBranch}</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900 dark:text-gray-100">{toBranch}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-gray-100">
                    {transfer.quantity}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant={statusConfig.variant} size="sm">
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {statusConfig.label}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div>{formatDate(transfer.createdAt)}</div>
                    {requestedBy && (
                      <div className="text-xs">by {requestedBy}</div>
                    )}
                  </td>
                  {showActions && (
                    <td className="px-6 py-4 text-right">
                      {availableTransitions.length > 0 && onStatusUpdate && (
                        <div className="flex justify-end gap-2">
                          {availableTransitions.map((status) => (
                            <Button
                              key={status}
                              variant={status === 'cancelled' ? 'danger' : 'secondary'}
                              size="sm"
                              onClick={() => onStatusUpdate(transfer._id, status)}
                              disabled={isUpdating}
                            >
                              {status === 'in-transit' ? 'Ship' : 
                               status === 'completed' ? 'Complete' : 'Cancel'}
                            </Button>
                          ))}
                        </div>
                      )}
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
        {transfers.map((transfer) => {
          const productName = isPopulatedStockProduct(transfer.product)
            ? transfer.product.name
            : 'Unknown Product';
          const fromBranch = isPopulatedStockBranch(transfer.fromBranch)
            ? transfer.fromBranch.name
            : 'Unknown';
          const toBranch = isPopulatedStockBranch(transfer.toBranch)
            ? transfer.toBranch.name
            : 'Unknown';
          
          const statusConfig = getStatusConfig(transfer.status);
          const StatusIcon = statusConfig.icon;
          const availableTransitions = getAvailableTransitions(transfer.status);

          return (
            <div key={transfer._id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <Link
                  href={`/stock/transfers/${transfer._id}`}
                  className="font-medium text-yellow-600 dark:text-yellow-400"
                >
                  {transfer.transferNumber}
                </Link>
                <Badge variant={statusConfig.variant} size="sm">
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusConfig.label}
                </Badge>
              </div>
              
              <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                {productName}
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                <span>{fromBranch}</span>
                <ArrowRight className="w-4 h-4" />
                <span>{toBranch}</span>
                <span className="ml-auto font-medium text-gray-900 dark:text-gray-100">
                  Qty: {transfer.quantity}
                </span>
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {formatDate(transfer.createdAt)}
              </div>

              {showActions && availableTransitions.length > 0 && onStatusUpdate && (
                <div className="flex gap-2">
                  {availableTransitions.map((status) => (
                    <Button
                      key={status}
                      variant={status === 'cancelled' ? 'danger' : 'secondary'}
                      size="sm"
                      className="flex-1"
                      onClick={() => onStatusUpdate(transfer._id, status)}
                      disabled={isUpdating}
                    >
                      {status === 'in-transit' ? 'Ship' : 
                       status === 'completed' ? 'Complete' : 'Cancel'}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TransferList;
