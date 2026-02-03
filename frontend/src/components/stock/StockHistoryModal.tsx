'use client';

import React, { useState } from 'react';
import { History, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { StockMovementTable } from './StockMovementTable';
import { useStockMovementsByStock } from '@/hooks/useStock';
import { Stock, isPopulatedStockProduct, isPopulatedStockBranch } from '@/types/stock';

interface StockHistoryModalProps {
  isOpen: boolean;
  stock: Stock | null;
  onClose: () => void;
}

const ITEMS_PER_PAGE = 10;

/**
 * StockHistoryModal component
 * 
 * Modal that displays the movement history for a specific stock record
 */
export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  isOpen,
  stock,
  onClose,
}) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useStockMovementsByStock(
    stock?._id,
    { page, limit: ITEMS_PER_PAGE },
    { enabled: isOpen && !!stock }
  );

  // Reset page when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setPage(1);
    }
  }, [isOpen]);

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

  const movements = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.pages ?? 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <History className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Stock History
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Movement history for this stock record
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

        {/* Stock Info */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
          <div className="font-medium text-gray-900 dark:text-gray-100">{productName}</div>
          {productSku && (
            <div className="text-sm text-gray-500 dark:text-gray-400">SKU: {productSku}</div>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Branch: {branchName} • Current Stock: <strong>{stock.quantity}</strong>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="text-center py-8 text-red-500">
            <p>Error loading history: {error.message}</p>
          </div>
        )}

        {/* Movement List */}
        <div className="max-h-[400px] overflow-y-auto">
          <StockMovementTable
            movements={movements}
            isLoading={isLoading}
            showProduct={false}
            showBranch={false}
          />
        </div>

        {/* Pagination */}
        {pagination && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages} ({pagination.total} records)
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Close Button */}
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default StockHistoryModal;
