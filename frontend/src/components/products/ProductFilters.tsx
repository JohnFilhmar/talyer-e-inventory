'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { useActiveCategories } from '@/hooks/useCategories';
import { useActiveMotorcycleModels, groupByMake } from '@/hooks/useMotorcycleModels';
import { motorcycleModelLabel } from '@/types/motorcycleModel';
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
  /** Comma-joined motorcycle model ids — the wire format the API expects. */
  motorcycleModel: string;
  active: string;
  minPrice: string;
  maxPrice: string;
  sortBy: string;
  sortOrder: string;
}

/** Splits the comma-joined filter value into ids, tolerating an empty string. */
const splitIds = (value: string): string[] =>
  value ? value.split(',').filter(Boolean) : [];

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
  const { data: motorcycleModels, isLoading: motorcycleModelsLoading } =
    useActiveMotorcycleModels();

  const categoryOptions = useMemo<ComboboxOption[]>(
    () => (categories ?? []).map((cat) => ({ value: cat._id, label: cat.name })),
    [categories]
  );
  
  // Local state for all filter inputs (for immediate UI feedback)
  const [localFilters, setLocalFilters] = useState<LocalFilters>({
    search: filters.search ?? '',
    category: filters.category ?? '',
    brand: filters.brand ?? '',
    motorcycleModel: filters.motorcycleModel ?? '',
    active: filters.active ?? '',
    minPrice: filters.minPrice?.toString() ?? '',
    maxPrice: filters.maxPrice?.toString() ?? '',
    sortBy: filters.sortBy ?? 'createdAt',
    sortOrder: filters.sortOrder ?? 'desc',
  });
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local filters when external filters change (e.g., reset).
  // This is deliberate prop-to-state derivation, done during render rather
  // than in a useEffect: adjusting state in response to a prop change inside
  // an effect causes an extra render pass (React first renders with stale
  // local state, then re-renders after the effect fires). Doing it during
  // render instead — guarded by a reference comparison against the previous
  // `filters` value — lets React apply the state update before painting,
  // avoiding that extra render. See https://react.dev/learn/you-might-not-need-an-effect
  // ("Adjusting some state when a prop changes"). The `prevFilters !== filters`
  // check mirrors the effect's old `[filters]` dependency: it only re-syncs
  // when the prop is a new reference, not on every render.
  const [prevFilters, setPrevFilters] = useState(filters);
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setLocalFilters({
      search: filters.search ?? '',
      category: filters.category ?? '',
      brand: filters.brand ?? '',
      motorcycleModel: filters.motorcycleModel ?? '',
      active: filters.active ?? '',
      minPrice: filters.minPrice?.toString() ?? '',
      maxPrice: filters.maxPrice?.toString() ?? '',
      sortBy: filters.sortBy ?? 'createdAt',
      sortOrder: filters.sortOrder ?? 'desc',
    });
  }

  // Apply filters to parent (called after debounce)
  const applyFilters = useCallback((newLocalFilters: LocalFilters) => {
    const newFilters: ProductListParams = {
      limit: filters.limit,
    };
    
    if (newLocalFilters.search) newFilters.search = newLocalFilters.search;
    if (newLocalFilters.category) newFilters.category = newLocalFilters.category;
    if (newLocalFilters.brand) newFilters.brand = newLocalFilters.brand;
    if (newLocalFilters.motorcycleModel) {
      newFilters.motorcycleModel = newLocalFilters.motorcycleModel;
    }
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

  // Adding and removing a motorcycle both go through the same debounced path
  // as every other filter, so a burst of picks results in one refetch rather
  // than one per chip.
  const selectedMotorcycleIds = splitIds(localFilters.motorcycleModel);

  // Already-picked motorcycles drop out of the list, so the same filter cannot
  // be added twice. Grouped by make and pre-sorted for the combobox headings.
  const motorcycleOptions: ComboboxOption[] = groupByMake(
    (motorcycleModels ?? []).filter((m) => !selectedMotorcycleIds.includes(m._id))
  ).flatMap(({ make, models }) =>
    models.map((motorcycleModel) => ({
      value: motorcycleModel._id,
      label: motorcycleModelLabel(motorcycleModel),
      group: make,
    }))
  );

  const handleMotorcycleAdd = useCallback((id: string) => {
    if (!id) return;
    const current = splitIds(localFilters.motorcycleModel);
    if (current.includes(id)) return;
    handleLocalChange('motorcycleModel', [...current, id].join(','));
  }, [localFilters.motorcycleModel, handleLocalChange]);

  const handleMotorcycleRemove = useCallback((id: string) => {
    const current = splitIds(localFilters.motorcycleModel);
    handleLocalChange('motorcycleModel', current.filter((v) => v !== id).join(','));
  }, [localFilters.motorcycleModel, handleLocalChange]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // `active: 'true'` is the list's default, not something the user chose, so it
  // must not count as an applied filter — otherwise the badge reads 1 and a
  // "Clear all" button appears on an untouched page.
  const activeFilterCount = Object.keys(filters).filter(
    (key) =>
      !['page', 'limit', 'sortBy', 'sortOrder'].includes(key) &&
      filters[key as keyof ProductListParams] &&
      !(key === 'active' && filters.active === 'true')
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
          <Combobox
            options={categoryOptions}
            value={localFilters.category}
            onChange={(next) => handleLocalChange('category', next)}
            isLoading={categoriesLoading}
            placeholder="All categories"
            emptyOptionLabel="All categories"
          />
        </div>

        {/* Brand */}
        <div>
          <Input
            placeholder="Brand"
            value={localFilters.brand}
            onChange={(e) => handleLocalChange('brand', e.target.value)}
          />
        </div>

        {/* Motorcycle models — multi-select. Products matching ANY of the
            picked motorcycles are shown: a customer with two bikes wants the
            parts for either, not only those fitting both. */}
        <div className="sm:col-span-2">
          {/* Always holds '' — an "add" control, not a bound single value.
              The real state is the chip list below. */}
          <Combobox
            options={motorcycleOptions}
            value=""
            onChange={handleMotorcycleAdd}
            isLoading={motorcycleModelsLoading}
            placeholder="Search a motorcycle to filter by..."
          />

          {selectedMotorcycleIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedMotorcycleIds.map((id) => {
                const motorcycleModel = motorcycleModels?.find((m) => m._id === id);
                const text = motorcycleModel
                  ? motorcycleModelLabel(motorcycleModel)
                  : 'Unknown motorcycle';

                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs"
                  >
                    {text}
                    <button
                      type="button"
                      onClick={() => handleMotorcycleRemove(id)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      aria-label={`Remove ${text} filter`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <select
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            value={localFilters.active}
            onChange={(e) => handleLocalChange('active', e.target.value)}
          >
            {/* Deleting a product is a soft delete (isActive false,
                isDiscontinued true), so "all" genuinely means archived rows
                included — worth saying, since the list defaults to active. */}
            <option value="true">Active only</option>
            <option value="false">Archived only</option>
            <option value="">Active + archived</option>
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
