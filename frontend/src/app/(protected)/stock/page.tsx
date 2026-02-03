'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Package, RefreshCw, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useActiveSuppliers } from '@/hooks/useSuppliers';
import {
  useStock,
  useStockByBranch,
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
import { Stock } from '@/types/stock';
import type { RestockFormData, AdjustStockFormData, CreateStockFormData } from '@/utils/validators/stock';

/**
 * Stock Overview Page
 * 
 * Main stock management page showing all stock across branches
 * with filtering, sorting, and restock/adjust capabilities.
 */
export default function StockPage() {
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState('product.name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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

  // Use branch-specific query if a branch is selected, otherwise get all stock
  const allStockQuery = useStock(
    {},
    { enabled: !selectedBranch }
  );

  const branchStockQuery = useStockByBranch(
    selectedBranch || undefined,
    { enabled: !!selectedBranch }
  );

  const lowStockQuery = useLowStock();

  // Mutations - use by-ID versions for modals
  const restockMutation = useRestockById();
  const adjustMutation = useAdjustStockById();
  const addStockMutation = useRestock();

  // Determine which data to use and extract array
  const stockQuery = selectedBranch ? branchStockQuery : allStockQuery;
  
  // Extract stock array from query data
  const stockData = useMemo(() => {
    const data = stockQuery.data;
    if (!data) return [];
    // Check if it's a paginated response or just an array
    if (Array.isArray(data)) return data;
    if ('data' in data && Array.isArray(data.data)) return data.data;
    return [];
  }, [stockQuery.data]);

  // Filter and sort stock data
  const filteredStock = useMemo(() => {
    let filtered = [...stockData];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((stock) => {
        const product = stock.product as { name?: string; sku?: string; barcode?: string };
        return (
          product?.name?.toLowerCase().includes(searchLower) ||
          product?.sku?.toLowerCase().includes(searchLower) ||
          product?.barcode?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Low stock filter
    if (showLowStock || showOutOfStock) {
      filtered = filtered.filter((stock) => {
        const available = stock.quantity - stock.reservedQuantity;
        if (showOutOfStock && stock.quantity === 0) return true;
        if (showLowStock && available <= stock.reorderPoint && stock.quantity > 0) return true;
        return false;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'product.name':
          aVal = (a.product as { name?: string })?.name ?? '';
          bVal = (b.product as { name?: string })?.name ?? '';
          break;
        case 'branch.name':
          aVal = (a.branch as { name?: string })?.name ?? '';
          bVal = (b.branch as { name?: string })?.name ?? '';
          break;
        case 'quantity':
          aVal = a.quantity;
          bVal = b.quantity;
          break;
        case 'available':
          aVal = a.quantity - a.reservedQuantity;
          bVal = b.quantity - b.reservedQuantity;
          break;
        case 'sellingPrice':
          aVal = a.sellingPrice;
          bVal = b.sellingPrice;
          break;
        default:
          aVal = (a.product as { name?: string })?.name ?? '';
          bVal = (b.product as { name?: string })?.name ?? '';
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return filtered;
  }, [stockData, search, showLowStock, showOutOfStock, sortField, sortOrder]);

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
      totalItems: stockData.length,
      totalValue,
      lowStockCount: lowStockArray?.length ?? 0,
      outOfStockCount,
    };
  }, [stockData, lowStockQuery.data]);

  // Handlers
  const handleSortChange = useCallback((field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField]);

  const handleResetFilters = useCallback(() => {
    setSearch('');
    setSelectedBranch('');
    setShowLowStock(false);
    setShowOutOfStock(false);
  }, []);

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
        onSearchChange={setSearch}
        branchId={selectedBranch}
        onBranchChange={setSelectedBranch}
        branches={branches}
        branchesLoading={branchesLoading}
        showLowStock={showLowStock}
        onShowLowStockChange={setShowLowStock}
        showOutOfStock={showOutOfStock}
        onShowOutOfStockChange={setShowOutOfStock}
        onReset={handleResetFilters}
      />

      {/* Stock Table */}
      {stockQuery.error ? (
        <Alert variant="error" title="Error loading stock">
          {stockQuery.error.message}
        </Alert>
      ) : (
        <StockTable
          stocks={filteredStock}
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

      {/* Pagination placeholder - can be added later */}
      {filteredStock.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Showing {filteredStock.length} of {stockData.length} stock records
        </div>
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
