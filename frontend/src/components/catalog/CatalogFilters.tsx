'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { catalogHref } from '@/lib/public/catalogHref';
import { formatFitment } from '@/lib/public/formatFitment';
import type { CatalogQuery } from '@/types/catalog';
import type { PublicCategory, PublicMotorcycleModel } from '@/utils/validators/publicCatalog';

/** Props for {@link CatalogFilters}. */
export interface CatalogFiltersProps {
  /** Category options. */
  categories: PublicCategory[];
  /** Fitment options, sorted by make then model. */
  motorcycleModels: PublicMotorcycleModel[];
  /** The query the page was rendered with. */
  current: CatalogQuery;
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A to Z' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
];

const FIELD_CLASS =
  'w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-base text-black focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400';

/** Search, category, fitment and sort controls; every change goes back to page 1. */
export function CatalogFilters({ categories, motorcycleModels, current }: CatalogFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(current.search ?? '');

  const go = (next: CatalogQuery) => router.push(catalogHref({ ...current, ...next, page: 1 }));

  const categoryOptions: ComboboxOption[] = categories.map((category) => ({
    value: category._id,
    label: category.name,
  }));
  const fitmentOptions: ComboboxOption[] = motorcycleModels.map((model) => ({
    value: model._id,
    label: formatFitment(model),
    group: model.make,
  }));

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go({ search: search.trim() || undefined });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <form role="search" onSubmit={onSearch} className="flex flex-col gap-1">
        <label htmlFor="catalog-search" className="text-sm font-medium text-black">
          Search parts
        </label>
        <div className="flex gap-2">
          <input
            id="catalog-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Part, brand or motorcycle"
            className={FIELD_CLASS}
          />
          <button
            type="submit"
            className="rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black hover:bg-black hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
          >
            Search
          </button>
        </div>
      </form>
      <Combobox
        id="catalog-category"
        label="Category"
        options={categoryOptions}
        value={current.category ?? ''}
        onChange={(value) => go({ category: value || undefined })}
        emptyOptionLabel="All categories"
        placeholder="All categories"
      />
      <Combobox
        id="catalog-fitment"
        label="Fits motorcycle"
        options={fitmentOptions}
        value={current.motorcycle_model ?? ''}
        onChange={(value) => go({ motorcycle_model: value || undefined })}
        emptyOptionLabel="Any motorcycle"
        placeholder="Any motorcycle"
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-sort" className="text-sm font-medium text-black">
          Sort by
        </label>
        <select
          id="catalog-sort"
          value={current.sort ?? 'newest'}
          onChange={(event) => go({ sort: event.target.value })}
          className={FIELD_CLASS}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
