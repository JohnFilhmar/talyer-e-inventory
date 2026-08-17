'use client';

import React, { useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProducts, useDeleteProduct, useRestoreProduct } from '@/hooks/useProducts';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useHighlightNew } from '@/hooks/useHighlightNew';
import { ProductGrid, ProductFilters, DeleteProductModal } from '@/components/products';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import type { Product, ProductListParams } from '@/types/product';

// Module scope, not an inline literal: useUrlFilters memoises on this object's
// identity, and a fresh literal each render would rebuild `filters` each render
// — which resets ProductFilters' local input state on every keystroke.
const PRODUCT_FILTER_DEFAULTS: Record<string, string | number> = {
  page: 1,
  limit: 12,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  // Deleting a product is a soft delete — it stays in the collection with
  // isActive false and isDiscontinued true. Without this the catalog kept
  // listing everything ever deleted, and a deleted product stayed on screen
  // after the delete succeeded. Archived rows are reachable through the
  // Status filter.
  active: 'true',
  search: '',
  category: '',
  brand: '',
  motorcycleModel: '',
  minPrice: '',
  maxPrice: '',
  new: '',
};

// A hand-edited or shared link can carry a non-numeric minPrice/maxPrice
// (`?minPrice=abc`). `page`/`limit` get free protection from useUrlFilters's
// `coerce`, because their defaults are typed as numbers; minPrice/maxPrice
// default to '' so that inference never fires, and a garbage value would
// otherwise pass straight through to `Number(...)` as the API param, sending
// `minPrice=NaN`. Validate explicitly instead, falling back to ''.
function parseNumericOrEmpty(raw: string): string {
  return raw !== '' && Number.isFinite(Number(raw)) ? raw : '';
}

// Module scope for the same reason as PRODUCT_FILTER_DEFAULTS: useUrlFilters
// memoises on this object's identity too.
const PRODUCT_FILTER_PARSERS = {
  minPrice: parseNumericOrEmpty,
  maxPrice: parseNumericOrEmpty,
};

/**
 * Products list page
 *
 * Features:
 * - Product grid with responsive layout
 * - Advanced filters (category, brand, price range, status)
 * - Debounced search (600ms)
 * - Pagination
 * - Admin can add, edit, and delete products
 *
 * Filter/pagination state lives in the URL (`useUrlFilters`), not component
 * state, so opening a product from a filtered, paginated grid and pressing
 * Back restores that same view instead of an unfiltered page 1.
 */
export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Filter state, backed by the URL.
  const { filters: urlFilters, setFilters, resetFilters } = useUrlFilters(
    PRODUCT_FILTER_DEFAULTS,
    PRODUCT_FILTER_PARSERS
  );

  // `ProductListParams` expects numbers for `minPrice` / `maxPrice` and omits
  // empties, so build the query params separately from the URL state.
  const filters: ProductListParams = useMemo(() => ({
    page: Number(urlFilters.page),
    limit: Number(urlFilters.limit),
    sortBy: urlFilters.sortBy as ProductListParams['sortBy'],
    sortOrder: urlFilters.sortOrder as 'asc' | 'desc',
    // `'all'` is the URL's sentinel for "Active + archived" — see
    // `handleFilterChange` below for why a plain '' can't round-trip through
    // the URL. The backend has no notion of `'all'`, so it is translated to
    // "omit the key" here rather than forwarded as a literal string. Omitting
    // the key also means `filters.active` reads as `undefined` wherever this
    // same object is passed down to `ProductFilters`, which already treats
    // that the same as '' (its `active: filters.active ?? ''` seed below),
    // so the "Active + archived" option is shown correctly with no separate
    // translation needed for the UI side.
    ...(urlFilters.active && urlFilters.active !== 'all'
      ? { active: String(urlFilters.active) }
      : {}),
    ...(urlFilters.search ? { search: String(urlFilters.search) } : {}),
    ...(urlFilters.category ? { category: String(urlFilters.category) } : {}),
    ...(urlFilters.brand ? { brand: String(urlFilters.brand) } : {}),
    ...(urlFilters.motorcycleModel ? { motorcycleModel: String(urlFilters.motorcycleModel) } : {}),
    ...(urlFilters.minPrice ? { minPrice: Number(urlFilters.minPrice) } : {}),
    ...(urlFilters.maxPrice ? { maxPrice: Number(urlFilters.maxPrice) } : {}),
  }), [urlFilters]);
  // `new` is carried in the URL but deliberately excluded here — it is a UI
  // concern, not a query parameter, and sending it would bust the React
  // Query cache key for no reason.

  // Highlight a product just created elsewhere and redirected back here via
  // /products?new=<id>.
  const { highlightedId, highlight, getHighlightProps } = useHighlightNew();
  const newId = String(urlFilters.new ?? '');

  // Derive-during-render rather than useEffect — the React Compiler lint
  // rejects setState in an effect body. Mirrors ProductFilters.tsx:82-96.
  const [seenNewId, setSeenNewId] = useState('');
  if (newId && newId !== seenNewId) {
    setSeenNewId(newId);
    highlight(newId);
  }

  // Modal state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // Fetch products
  const { data, isLoading, error } = useProducts(filters);
  const products = data?.data ?? [];
  const pagination = data?.pagination;

  // Delete mutation
  const deleteMutation = useDeleteProduct();
  const restoreMutation = useRestoreProduct();

  // Deleting a product only archives it, so there has to be a way back. The
  // archived rows are reachable through the Status filter.
  const handleRestoreProduct = useCallback(
    async (product: Product) => {
      try {
        await restoreMutation.mutateAsync(product._id);
      } catch {
        // Surfaced by the mutation's error state below.
      }
    },
    [restoreMutation]
  );

  // Handlers
  const handleAddProduct = useCallback(() => {
    router.push('/products/new');
  }, [router]);

  const handleEditProduct = useCallback((product: Product) => {
    router.push(`/products/${product._id}/edit`);
  }, [router]);

  const handleDeleteProduct = useCallback((product: Product) => {
    setDeletingProduct(product);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingProduct) return;

    try {
      await deleteMutation.mutateAsync(deletingProduct._id);
      setDeletingProduct(null);
    } catch {
      // Error handled by mutation state
    }
  }, [deletingProduct, deleteMutation]);

  const handleDeleteClose = useCallback(() => {
    setDeletingProduct(null);
    deleteMutation.reset();
  }, [deleteMutation]);

  const handleFilterChange = useCallback((next: ProductListParams) => {
    setFilters({
      search: next.search ?? '',
      category: next.category ?? '',
      brand: next.brand ?? '',
      motorcycleModel: next.motorcycleModel ?? '',
      // ProductFilters' applyFilters only sets `active` when it's truthy, so
      // "Active + archived" arrives here as `undefined`. Write the `'all'`
      // sentinel for it: useUrlFilters drops a plain '' from the URL as "no
      // value" and would silently re-derive the default `'true'` on the next
      // read, which is the bug this sentinel exists to avoid.
      active: next.active ?? 'all',
      minPrice: next.minPrice?.toString() ?? '',
      maxPrice: next.maxPrice?.toString() ?? '',
      sortBy: next.sortBy ?? 'createdAt',
      sortOrder: next.sortOrder ?? 'desc',
      // Already debounced by 800ms inside ProductFilters, so this is a commit,
      // not a keystroke — push, so Back undoes an applied filter.
    }, 'push');
  }, [setFilters]);

  const handlePageChange = useCallback((newPage: number) => {
    setFilters({ page: newPage }, 'push');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setFilters]);

  // Check if user has access
  if (!user) {
    return (
      <div className="text-center py-12">
        <Alert variant="error">
          Please log in to view this page.
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
            <Package className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Products
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {pagination?.total !== undefined
                ? `${pagination.total} product${pagination.total === 1 ? '' : 's'} found`
                : 'Manage your product catalog'}
            </p>
          </div>
        </div>

        {showAdminActions && (
          <Button variant="primary" onClick={handleAddProduct}>
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        )}
      </div>

      {/* Filters */}
      <ProductFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onReset={resetFilters}
      />

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
              {getPageNumbers(pagination.page, pagination.pages).map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page as number)}
                    className={`
                      w-8 h-8 rounded-md text-sm font-medium transition-colors
                      ${pagination.page === page
                        ? 'bg-yellow-500 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }
                    `}
                  >
                    {page}
                  </button>
                )
              ))}
            </div>

            {/* Mobile page indicator */}
            <span className="sm:hidden text-sm text-gray-600 dark:text-gray-300">
              Page {pagination.page} of {pagination.pages}
            </span>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {restoreMutation.error && (
        <Alert variant="error" className="mb-4">
          {restoreMutation.error.message}
        </Alert>
      )}

      {/* Product Grid */}
      <ProductGrid
        products={products}
        isLoading={isLoading}
        error={error}
        onEdit={showAdminActions ? handleEditProduct : undefined}
        onDelete={showAdminActions ? handleDeleteProduct : undefined}
        onRestore={showAdminActions ? handleRestoreProduct : undefined}
        restoringId={restoreMutation.isPending ? restoreMutation.variables : null}
        isAdmin={showAdminActions}
        highlightedId={highlightedId}
        getHighlightProps={getHighlightProps}
        emptyMessage={
          Object.keys(filters).some(
            (k) =>
              !['page', 'limit', 'sortBy', 'sortOrder'].includes(k) &&
              filters[k as keyof ProductListParams] &&
              // The default active filter is not a user choice, so an empty
              // catalog must not claim nothing matched the filters.
              !(k === 'active' && filters.active === 'true')
          )
            ? 'No products match your filters'
            : 'No products yet'
        }
      />

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
              {getPageNumbers(pagination.page, pagination.pages).map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page as number)}
                    className={`
                      w-8 h-8 rounded-md text-sm font-medium transition-colors
                      ${pagination.page === page
                        ? 'bg-yellow-500 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }
                    `}
                  >
                    {page}
                  </button>
                )
              ))}
            </div>

            {/* Mobile page indicator */}
            <span className="sm:hidden text-sm text-gray-600 dark:text-gray-300">
              Page {pagination.page} of {pagination.pages}
            </span>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteProductModal
        product={deletingProduct}
        isOpen={!!deletingProduct}
        isLoading={deleteMutation.isPending}
        error={deleteMutation.error}
        onClose={handleDeleteClose}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

/**
 * Generate page numbers with ellipsis for pagination
 */
function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [];

  // Always show first page
  pages.push(1);

  if (current > 3) {
    pages.push('...');
  }

  // Show pages around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('...');
  }

  // Always show last page
  if (total > 1) {
    pages.push(total);
  }

  return pages;
}
