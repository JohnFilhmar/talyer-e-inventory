'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Branch } from '@/types';

/** Same 800ms as ProductFilters — one search idiom across the two list pages. */
const SEARCH_DEBOUNCE_MS = 800;

interface StockFiltersProps {
  /** Committed search term, read back from the URL. */
  search: string;
  /** Called on a debounce, not per keystroke — see `handleSearchChange`. */
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
  // The typed value renders from here, never from the URL. `onSearchChange`
  // ends in a `router.replace`, and Next's navigation is a transition: the
  // render right after `onChange` still carries the old committed term, so a
  // directly-controlled input has its character wiped by React's controlled-
  // input restoration until the transition commits. Mirror locally and push to
  // the URL on a debounce, exactly as ProductFilters does.
  const [localSearch, setLocalSearch] = useState(search);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The pending commit must run against the *current* callback, not the one
  // captured when the key was pressed. `onSearchChange` closes over the page's
  // `setFilters`, which in turn closes over the filter snapshot of its own
  // render — so firing the 800ms-old prop would write the URL from an 800ms-old
  // snapshot. Ticking Low Stock, switching branch or clicking a sort header
  // within that window would then be silently reverted by the debounce, looking
  // for all the world like the UI ignored the click.
  //
  // Kept current from an effect, not from the render body: the React Compiler
  // lint rejects writing a ref during render. That is late enough — the timer
  // is scheduled from an event handler and fires 800ms later, long after any
  // re-render has committed and run this.
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  // Prop-to-state resync, derived during render rather than in an effect (the
  // project's React Compiler lint rejects setState in an effect body, and an
  // effect would cost a second render pass). Skipped while a debounce is
  // pending: the URL then still holds the pre-debounce term, and adopting it
  // would wipe whatever has been typed since. `prevSearch` is updated either
  // way, so a skipped resync does not fire spuriously on a later render.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    if (debounceTimerRef.current === null) {
      setLocalSearch(search);
    }
  }

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        // Nulled before the commit so the resync above knows nothing is
        // pending any more — leave it set and the resync never runs again.
        debounceTimerRef.current = null;
        // Through the ref, never the captured prop — see `onSearchChangeRef`.
        onSearchChangeRef.current(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    []
  );

  const handleReset = useCallback(() => {
    // A pending timer would otherwise fire after the reset and put the search
    // term straight back into the URL.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setLocalSearch('');
    onReset();
  }, [onReset]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const hasActiveFilters = localSearch || branchId || showLowStock || showOutOfStock;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
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
            onClick={handleReset}
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
