'use client';

import React from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Branch } from '@/types';

interface StockFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  branchId: string;
  onBranchChange: (value: string) => void;
  branches: Branch[];
  branchesLoading?: boolean;
  showLowStock: boolean;
  onShowLowStockChange: (value: boolean) => void;
  showOutOfStock: boolean;
  onShowOutOfStockChange: (value: boolean) => void;
  onReset: () => void;
}

/**
 * StockFilters component
 * 
 * Provides filtering controls for the stock table including
 * search, branch filter, and quick filters for low/out of stock.
 */
export const StockFilters: React.FC<StockFiltersProps> = ({
  search,
  onSearchChange,
  branchId,
  onBranchChange,
  branches,
  branchesLoading = false,
  showLowStock,
  onShowLowStockChange,
  showOutOfStock,
  onShowOutOfStockChange,
  onReset,
}) => {
  const hasActiveFilters = search || branchId || showLowStock || showOutOfStock;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by product name, SKU, or barcode..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Branch Filter */}
        <div className="w-full lg:w-64">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={branchId}
              onChange={(e) => onBranchChange(e.target.value)}
              disabled={branchesLoading}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent appearance-none cursor-pointer"
            >
              <option value="">All Branches</option>
              {branches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">Quick filters:</span>
        
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showLowStock}
            onChange={(e) => onShowLowStockChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className={`
            px-3 py-1.5 rounded-full text-sm font-medium transition-colors
            ${showLowStock 
              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 ring-1 ring-orange-500' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }
          `}>
            Low Stock
          </div>
        </label>

        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showOutOfStock}
            onChange={(e) => onShowOutOfStockChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className={`
            px-3 py-1.5 rounded-full text-sm font-medium transition-colors
            ${showOutOfStock 
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-1 ring-red-500' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }
          `}>
            Out of Stock
          </div>
        </label>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
};

export default StockFilters;
