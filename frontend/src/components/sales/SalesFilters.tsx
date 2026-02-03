'use client';

import React from 'react';
import { Search, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  type OrderStatus,
  type PaymentStatus,
} from '@/types/sales';
import type { Branch } from '@/types/branch';

interface SalesFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  branchId: string;
  onBranchChange: (value: string) => void;
  branches: Branch[];
  branchesLoading?: boolean;
  status: OrderStatus | '';
  onStatusChange: (value: OrderStatus | '') => void;
  paymentStatus: PaymentStatus | '';
  onPaymentStatusChange: (value: PaymentStatus | '') => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  onReset: () => void;
  showBranchFilter?: boolean;
}

/**
 * SalesFilters component
 *
 * Filter bar for sales orders with search, branch, status, payment status, and date range.
 */
export const SalesFilters: React.FC<SalesFiltersProps> = ({
  search,
  onSearchChange,
  branchId,
  onBranchChange,
  branches,
  branchesLoading = false,
  status,
  onStatusChange,
  paymentStatus,
  onPaymentStatusChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onReset,
  showBranchFilter = true,
}) => {
  const hasFilters =
    search ||
    branchId ||
    status ||
    paymentStatus ||
    startDate ||
    endDate;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      {/* Search and Branch */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by order ID, customer name or phone..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
          />
        </div>

        {/* Branch Selector */}
        {showBranchFilter && (
          <select
            value={branchId}
            onChange={(e) => onBranchChange(e.target.value)}
            disabled={branchesLoading}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent min-w-[180px]"
          >
            <option value="">All Branches</option>
            {branches.map((branch) => (
              <option key={branch._id} value={branch._id}>
                {branch.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Order Status */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => onStatusChange('')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                status === ''
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            {ORDER_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onStatusChange(option.value as OrderStatus)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  status === option.value
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Status */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Payment:</span>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => onPaymentStatusChange('')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                paymentStatus === ''
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            {PAYMENT_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onPaymentStatusChange(option.value as PaymentStatus)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  paymentStatus === option.value
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date Range */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500 dark:text-gray-400">From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
          />
        </div>

        {/* Reset Button */}
        {hasFilters && (
          <Button variant="secondary" size="sm" onClick={onReset}>
            <X className="w-4 h-4 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
};

export default SalesFilters;
