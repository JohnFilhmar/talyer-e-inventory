'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ShoppingCart, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useSalesOrders, useSalesStats } from '@/hooks/useSales';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  SalesStatsCards,
  SalesFilters,
  SalesOrderTable,
} from '@/components/sales';
import type { OrderStatus, PaymentStatus, SalesOrderFilters } from '@/types/sales';

/**
 * Sales Overview Page
 *
 * Main sales management page showing all sales orders across branches
 * with filtering, sorting, and pagination capabilities.
 */
export default function SalesPage() {
  const { user, isAdmin } = useAuth();
  const showAllBranches = isAdmin();

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<PaymentStatus | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Sort state
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch data
  const { data: branchesData, isLoading: branchesLoading } = useBranches();

  // Build filters object
  const filters: SalesOrderFilters = useMemo(() => {
    const f: SalesOrderFilters = {
      page,
      limit,
      sortBy: sortField,
      sortOrder,
    };

    if (search) f.search = search;
    if (selectedStatus) f.status = selectedStatus;
    if (selectedPaymentStatus) f.paymentStatus = selectedPaymentStatus;
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    if (selectedBranch) f.branch = selectedBranch;

    return f;
  }, [page, limit, sortField, sortOrder, search, selectedStatus, selectedPaymentStatus, startDate, endDate, selectedBranch]);

  // Get user's branch ID if not admin
  const userBranchId = useMemo(() => {
    if (showAllBranches || !user?.branch) return undefined;
    return typeof user.branch === 'string' ? user.branch : (user.branch as { _id: string })._id;
  }, [showAllBranches, user]);

  // Fetch sales orders with appropriate endpoint
  const {
    data: ordersData,
    isLoading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = useSalesOrders(filters);

  // Fetch sales stats for stats cards
  const { data: statsData, isLoading: statsLoading } = useSalesStats({
    branch: selectedBranch || userBranchId,
  });

  // Extract branches array from paginated response
  const branches = useMemo(() => {
    if (!branchesData) return [];
    return branchesData.data || [];
  }, [branchesData]);

  // Extract orders and pagination from response
  const orders = useMemo(() => {
    return ordersData?.data || [];
  }, [ordersData]);

  const pagination = ordersData?.pagination;

  // Client-side search filtering (if search is entered)
  const filteredOrders = useMemo(() => {
    if (!search) return orders;

    const searchLower = search.toLowerCase();
    return orders.filter((order) => {
      return (
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.customer.name.toLowerCase().includes(searchLower) ||
        (order.customer.phone && order.customer.phone.includes(searchLower)) ||
        (order.customer.email && order.customer.email.toLowerCase().includes(searchLower))
      );
    });
  }, [orders, search]);

  // Handle sort
  const handleSortChange = useCallback((field: string) => {
    if (field === sortField) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1); // Reset to first page on sort change
  }, [sortField]);

  // Handle filter reset
  const handleResetFilters = useCallback(() => {
    setSearch('');
    setSelectedBranch('');
    setSelectedStatus('');
    setSelectedPaymentStatus('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Sales Orders
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage and track all sales orders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => refetchOrders()}
            disabled={ordersLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${ordersLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/sales/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Sale
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {ordersError && (
        <Alert variant="error">
          Failed to load sales orders: {ordersError.message}
        </Alert>
      )}

      {/* Stats Cards */}
      <SalesStatsCards
        stats={statsData}
        isLoading={statsLoading}
      />

      {/* Filters */}
      <SalesFilters
        search={search}
        onSearchChange={setSearch}
        branchId={selectedBranch}
        onBranchChange={(branch) => {
          setSelectedBranch(branch);
          setPage(1);
        }}
        status={selectedStatus}
        onStatusChange={(status) => {
          setSelectedStatus(status);
          setPage(1);
        }}
        paymentStatus={selectedPaymentStatus}
        onPaymentStatusChange={(status) => {
          setSelectedPaymentStatus(status);
          setPage(1);
        }}
        startDate={startDate}
        onStartDateChange={(date) => {
          setStartDate(date);
          setPage(1);
        }}
        endDate={endDate}
        onEndDateChange={(date) => {
          setEndDate(date);
          setPage(1);
        }}
        branches={branches}
        branchesLoading={branchesLoading}
        showBranchFilter={showAllBranches}
        onReset={handleResetFilters}
      />

      {/* Orders Table */}
      <SalesOrderTable
        orders={filteredOrders}
        isLoading={ordersLoading}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />

      {/* Pagination */}
      {pagination && pagination.total > limit && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {page} of {pagination.pages || Math.ceil(pagination.total / limit)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= (pagination.pages || Math.ceil(pagination.total / limit))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Results Summary */}
      {!ordersLoading && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredOrders.length} of {pagination?.total || orders.length} orders
        </div>
      )}
    </div>
  );
}
