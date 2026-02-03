'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useActiveCategories } from '@/hooks/useCategories';
import type { ProductListParams } from '@/types/product';

interface ProductFiltersProps {
  filters: ProductListParams;
  onFilterChange: (filters: ProductListParams) => void;
  onReset?: () => void;
}

// Local filter state type for UI
interface LocalFilters {
  search: string;
  category: string;
  brand: string;
  active: string;
  minPrice: string;
  maxPrice: string;
  sortBy: string;
  sortOrder: string;
}

/**
 * ProductFilters component
 * 
 * Filter controls for the product list with 800ms debounce on all inputs
 */
export const ProductFilters: React.FC<ProductFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
}) => {
  const { data: categories, isLoading: categoriesLoading } = useActiveCategories();
  
  // Local state for all filter inputs (for immediate UI feedback)
  const [localFilters, setLocalFilters] = useState<LocalFilters>({
    search: filters.search ?? '',
    category: filters.category ?? '',
    brand: filters.brand ?? '',
    active: filters.active ?? '',
    minPrice: filters.minPrice?.toString() ?? '',
    maxPrice: filters.maxPrice?.toString() ?? '',
    sortBy: filters.sortBy ?? 'createdAt',
    sortOrder: filters.sortOrder ?? 'desc',
  });
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local filters when external filters change (e.g., reset)
  useEffect(() => {
    setLocalFilters({
      search: filters.search ?? '',
      category: filters.category ?? '',
      brand: filters.brand ?? '',
      active: filters.active ?? '',
      minPrice: filters.minPrice?.toString() ?? '',
      maxPrice: filters.maxPrice?.toString() ?? '',
      sortBy: filters.sortBy ?? 'createdAt',
      sortOrder: filters.sortOrder ?? 'desc',
    });
  }, [filters]);

  // Apply filters to parent (called after debounce)
  const applyFilters = useCallback((newLocalFilters: LocalFilters) => {
    const newFilters: ProductListParams = {
      limit: filters.limit,
    };
    
    if (newLocalFilters.search) newFilters.search = newLocalFilters.search;
    if (newLocalFilters.category) newFilters.category = newLocalFilters.category;
    if (newLocalFilters.brand) newFilters.brand = newLocalFilters.brand;
    if (newLocalFilters.active) newFilters.active = newLocalFilters.active;
    if (newLocalFilters.minPrice) newFilters.minPrice = Number(newLocalFilters.minPrice);
    if (newLocalFilters.maxPrice) newFilters.maxPrice = Number(newLocalFilters.maxPrice);
    if (newLocalFilters.sortBy) newFilters.sortBy = newLocalFilters.sortBy as ProductListParams['sortBy'];
    if (newLocalFilters.sortOrder) newFilters.sortOrder = newLocalFilters.sortOrder as 'asc' | 'desc';
    
    onFilterChange(newFilters);
  }, [filters.limit, onFilterChange]);

  // Debounced filter change handler
  const handleLocalChange = useCallback((key: keyof LocalFilters, value: string) => {
    const newLocalFilters = { ...localFilters, [key]: value };
    setLocalFilters(newLocalFilters);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new debounce timer (800ms)
    debounceTimerRef.current = setTimeout(() => {
      applyFilters(newLocalFilters);
    }, 800);
  }, [localFilters, applyFilters]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const activeFilterCount = Object.keys(filters).filter(
    (key) => !['page', 'limit', 'sortBy', 'sortOrder'].includes(key) && filters[key as keyof ProductListParams]
  ).length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Filters</h3>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        
        {activeFilterCount > 0 && onReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="w-4 h-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {/* Search */}
        <div className="sm:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={localFilters.search}
              onChange={(e) => handleLocalChange('search', e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <select
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            value={localFilters.category}
            onChange={(e) => handleLocalChange('category', e.target.value)}
            disabled={categoriesLoading}
          >
            <option value="">All Categories</option>
            {categories?.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Brand */}
        <div>
          <Input
            placeholder="Brand"
            value={localFilters.brand}
            onChange={(e) => handleLocalChange('brand', e.target.value)}
          />
        </div>

        {/* Status */}
        <div>
          <select
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            value={localFilters.active}
            onChange={(e) => handleLocalChange('active', e.target.value)}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        {/* Price Range */}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min price"
            value={localFilters.minPrice}
            onChange={(e) => handleLocalChange('minPrice', e.target.value)}
            min={0}
          />
          <span className="text-gray-400">-</span>
          <Input
            type="number"
            placeholder="Max price"
            value={localFilters.maxPrice}
            onChange={(e) => handleLocalChange('maxPrice', e.target.value)}
            min={0}
          />
        </div>

        {/* Sort */}
        <div className="flex gap-2">
          <select
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            value={localFilters.sortBy}
            onChange={(e) => handleLocalChange('sortBy', e.target.value)}
          >
            <option value="createdAt">Date Added</option>
            <option value="updatedAt">Last Updated</option>
            <option value="name">Name</option>
            <option value="sellingPrice">Price</option>
            <option value="costPrice">Cost</option>
          </select>
          <select
            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            value={localFilters.sortOrder}
            onChange={(e) => handleLocalChange('sortOrder', e.target.value)}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>
    </div>
  );
};
