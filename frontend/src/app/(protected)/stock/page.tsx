'use client';

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { Package, RefreshCw, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useActiveSuppliers } from '@/hooks/useSuppliers';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useBranchContext } from '@/providers/BranchProvider';
import {
  useStock,
  useLowStock,
  useRestockById,
  useAdjustStockById,
  useRestock,
} from '@/hooks/useStock';
import {
  StockStatsCards,
  StockFilters,
  StockTable,
  RestockModal,
  AdjustStockModal,
  AddStockModal,
  StockHistoryModal,
} from '@/components/stock';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Pagination, Spinner } from '@/components/ui';
import { Stock } from '@/types/stock';
import type { RestockFormData, AdjustStockFormData, CreateStockFormData } from '@/utils/validators/stock';

// Module scope, not an inline literal: useUrlFilters memoises `filters` on the
// identity of both `defaults` and `parse`, so a fresh object per render would
// rebuild `filters` every render.
const STOCK_FILTER_DEFAULTS = {
  search: '',
  branch: '',
  lowStock: false,
  outOfStock: false,
  sortField: 'product.name',
  sortOrder: 'asc',
  page: 1,
};

/** Rows per request. The server caps this at PAGINATION.MAX_LIMIT regardless. */
const PAGE_SIZE = 25;

/**
 * Columns the table can sort by. Must stay a subset of `STOCK_SORT_FIELDS` in
 * `backend/src/controllers/stockController.js`, which the API validates
 * against: an unknown field is a 400 rather than a silently ignored filter.
 */
const SORT_FIELDS = ['product.name', 'branch.name', 'quantity', 'available', 'sellingPrice'];

/**
 * Builds a parser that clamps a hand-edited or shared URL back to the default.
 * `?sortOrder=xyz` must read as "asc", not reach the sort comparator as a value
 * that matches neither branch.
 */
function oneOf<T extends string>(allowed: readonly T[], fallback: T) {
  return (raw: string): T => (allowed.includes(raw as T) ? (raw as T) : fallback);
}

/**
 * `branch` is the live one: an admin pasting a malformed branch id would send
 * it straight to the API and get a raw error back, where the spec's intent is a
 * silent clamp. Shape is enough — whether the id exists is the server's call,
 * and a valid-looking id the user cannot see is already handled by
 * `effectiveBranch` below.
 */
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const STOCK_FILTER_PARSERS = {
  branch: (raw: string) => (OBJECT_ID_PATTERN.test(raw) ? raw : ''),
  sortField: oneOf(SORT_FIELDS, 'product.name'),
  sortOrder: oneOf(['asc', 'desc'], 'asc'),
  // `?page=0`, `?page=-3` and `?page=abc` all have to read as page 1. A zero
  // or negative page reaches the API as a negative skip.
  page: (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  },
};

/**
 * Stock Overview Page
 *
 * Main stock management page showing all stock across branches
 * with filtering, sorting, and restock/adjust capabilities.
 */
function StockPageContent() {
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();
  const { branchId: userBranchId } = useBranchContext();

  // Filter state — lives in the URL so it survives navigation and refresh.
  const { filters, setFilters, resetFilters } = useUrlFilters(
    STOCK_FILTER_DEFAULTS,
    STOCK_FILTER_PARSERS
  );
  const search = String(filters.search);
  const selectedBranch = String(filters.branch);
  const showLowStock = Boolean(filters.lowStock);
  const showOutOfStock = Boolean(filters.outOfStock);
  const sortField = String(filters.sortField);
  // Safe cast: STOCK_FILTER_PARSERS allow-lists both of these, so a garbage
  // URL value has already been clamped back to its default by now.
  const sortOrder = filters.sortOrder as 'asc' | 'desc';
  const page = Number(filters.page);

  // A hand-edited or shared URL can name a branch this user cannot see. The
  // backend rejects it (utils/branchScope.js), but a 403 on page load is a
  // worse experience than silently showing the branch they do have.
  const effectiveBranch = showAdminActions ? selectedBranch : (userBranchId ?? '');

  // Modal state
  const [restockStock, setRestockStock] = useState<Stock | null>(null);
  const [adjustStock, setAdjustStock] = useState<Stock | null>(null);
  const [historyStock, setHistoryStock] = useState<Stock | null>(null);
  const [showAddStock, setShowAddStock] = useState(false);

  // Fetch data
  const { data: branchesData, isLoading: branchesLoading } = useBranches();
  const { data: suppliers = [] } = useActiveSuppliers();

  // Extract branches array from paginated response
  const branches = useMemo(() => {
    if (!branchesData) return [];
    return 'data' in branchesData ? branchesData.data : branchesData;
  }, [branchesData]);

  // One server-driven query, filtered, paginated and searched by the API.
  //
  // This used to be two: `GET /stock` for the all-branches view and
  // `GET /stock/branch/:id` for one branch, neither passing a page or a limit.
  // The API defaults to 20 and 50 rows respectively, so a shop with 300 SKUs
  // saw the first 20 and was told "Showing 20 of 20 stock records". `GET /stock`
  // takes a branch filter and clamps a non-admin to their own branch anyway, so
  // the branch endpoint was never needed here; it stays for the offline-capable
  // product pickers, which want the whole branch in one read.
  //
  // Search, low-stock and out-of-stock are all server-side now. Filtering the
  // fetched page in the browser searched only the rows already on screen.
  const stockQuery = useStock({
    branch: effectiveBranch || undefined,
    search: search || undefined,
    lowStock: showLowStock ? 'true' : undefined,
    outOfStock: showOutOfStock ? 'true' : undefined,
    sortBy: sortField,
    sortOrder,
    page,
    limit: PAGE_SIZE,
  });

  const lowStockQuery = useLowStock({ limit: 1 });

  // Mutations - use by-ID versions for modals
  const restockMutation = useRestockById();
  const adjustMutation = useAdjustStockById();
  const addStockMutation = useRestock();

  const stockData = useMemo(() => stockQuery.data?.data ?? [], [stockQuery.data]);
  const pagination = stockQuery.data?.pagination;

  // No client-side sorting. The API orders the whole result set and this page
  // renders what it is given: ordering the fetched page would reorder 25 rows
  // out of 300 while the control implies otherwise, and paginating an unordered
  // list lets a row appear on two pages or on none.

  // Calculate stats
  const stats = useMemo(() => {
    const lowStockData = lowStockQuery.data;
    const lowStockArray = lowStockData && 'data' in lowStockData ? lowStockData.data : [];
    const totalValue = stockData.reduce(
      (sum: number, s: Stock) => sum + s.quantity * s.sellingPrice,
      0
    );
    const outOfStockCount = stockData.filter((s: Stock) => s.quantity === 0).length;

    return {
      // The server's count across every page, not the rows on this one.
      totalItems: pagination?.total ?? stockData.length,
      // Value and out-of-stock count are still derived from the loaded page,
      // because no endpoint aggregates them. The labels say so.
      totalValue,
      lowStockCount: lowStockData?.pagination?.total ?? lowStockArray?.length ?? 0,
      outOfStockCount,
    };
  }, [stockData, pagination, lowStockQuery.data]);

  // Handlers
  const handleSortChange = useCallback((field: string) => {
    // Back to page one: the order changes, so page seven of the old order has
    // nothing to do with page seven of the new one.
    if (sortField === field) {
      setFilters({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 }, 'push');
    } else {
      setFilters({ sortField: field, sortOrder: 'asc', page: 1 }, 'push');
    }
  }, [sortField, sortOrder, setFilters]);

  const handlePageChange = useCallback((nextPage: number) => {
    setFilters({ page: nextPage }, 'push');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setFilters]);

  const handleRestock = useCallback(async (stockId: string, data: RestockFormData) => {
    await restockMutation.mutateAsync({
      stockId,
      data: {
        quantity: data.quantity,
        supplierId: data.supplierId || undefined,
        notes: data.notes || undefined,
      },
    });
  }, [restockMutation]);

  const handleAdjust = useCallback(async (stockId: string, data: AdjustStockFormData) => {
    await adjustMutation.mutateAsync({
      stockId,
      data: {
        quantity: data.quantity,
        reason: data.reason,
        notes: data.notes || undefined,
      },
    });
  }, [adjustMutation]);

  const handleAddStock = useCallback(async (data: CreateStockFormData) => {
    await addStockMutation.mutateAsync({
      product: data.product,
      branch: data.branch,
      quantity: data.quantity,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      reorderPoint: data.reorderPoint,
      reorderQuantity: data.reorderQuantity,
      supplier: data.supplier || undefined,
      location: data.location || undefined,
    });
    setShowAddStock(false);
  }, [addStockMutation]);

  const handleRefresh = useCallback(() => {
    stockQuery.refetch();
    lowStockQuery.refetch();
  }, [stockQuery, lowStockQuery]);

  // Auth check
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert variant="error">
          Please log in to view this page.
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
            <Package className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Stock Overview
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage inventory across all branches
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {showAdminActions && (
            <Button
              variant="primary"
              onClick={() => setShowAddStock(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Stock
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={stockQuery.isLoading || stockQuery.isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${stockQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <StockStatsCards
        stats={stats}
        isLoading={stockQuery.isLoading || lowStockQuery.isLoading}
      />

      {/* Filters */}
      <StockFilters
        search={search}
        // Debounced inside StockFilters. 'replace' (the default) on purpose —
        // a typing pause must not become a history entry.
        // Every filter change returns to page one. Staying on page seven while
        // narrowing to three results shows an empty table.
        onSearchChange={(v) => setFilters({ search: v, page: 1 }, 'replace')}
        branchId={effectiveBranch}
        onBranchChange={(v) => setFilters({ branch: v, page: 1 }, 'push')}
        branches={branches}
        branchesLoading={branchesLoading}
        showLowStock={showLowStock}
        onShowLowStockChange={(v) => setFilters({ lowStock: v, page: 1 }, 'push')}
        showOutOfStock={showOutOfStock}
        onShowOutOfStockChange={(v) => setFilters({ outOfStock: v, page: 1 }, 'push')}
        onReset={resetFilters}
      />

      {/* Stock Table */}
      {stockQuery.error ? (
        <Alert variant="error" title="Error loading stock">
          {stockQuery.error.message}
        </Alert>
      ) : (
        <StockTable
          stocks={stockData}
          isLoading={stockQuery.isLoading}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          onRestock={(stock) => setRestockStock(stock)}
          onAdjust={(stock) => setAdjustStock(stock)}
          onHistory={(stock) => setHistoryStock(stock)}
          isAdmin={showAdminActions}
        />
      )}

      {/* Pagination. The summary counts the server's total, not the rows on
          screen: the old footer read "Showing 20 of 20 stock records" to a shop
          holding 300 SKUs. */}
      {pagination && (
        <Pagination
          page={pagination.page}
          limit={pagination.limit}
          total={pagination.total}
          pages={pagination.pages}
          onPageChange={handlePageChange}
          label="stock records"
        />
      )}

      {/* Modals */}
      <RestockModal
        isOpen={!!restockStock}
        stock={restockStock}
        suppliers={suppliers}
        onClose={() => setRestockStock(null)}
        onRestock={handleRestock}
        isLoading={restockMutation.isPending}
        error={restockMutation.error}
      />

      <AdjustStockModal
        isOpen={!!adjustStock}
        stock={adjustStock}
        onClose={() => setAdjustStock(null)}
        onAdjust={handleAdjust}
        isLoading={adjustMutation.isPending}
        error={adjustMutation.error}
      />

      <AddStockModal
        isOpen={showAddStock}
        onClose={() => setShowAddStock(false)}
        branches={branches}
        suppliers={suppliers}
        onSubmit={handleAddStock}
        isLoading={addStockMutation.isPending}
        error={addStockMutation.error}
      />

      <StockHistoryModal
        isOpen={!!historyStock}
        stock={historyStock}
        onClose={() => setHistoryStock(null)}
      />
    </div>
  );
}

/**
 * `StockPageContent` reads filters from the URL via `useUrlFilters`, which
 * calls `useSearchParams()` — that opts this route into client rendering, so
 * it must be wrapped in Suspense or the static build fails.
 */
export default function StockPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-6 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <StockPageContent />
    </Suspense>
  );
}
