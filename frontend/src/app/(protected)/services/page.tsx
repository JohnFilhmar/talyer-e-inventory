'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Wrench, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useServiceOrders, useMechanics } from '@/hooks/useServices';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  ServiceStatsCards,
  ServiceFilters,
  ServiceOrderTable,
  AssignMechanicModal,
} from '@/components/services';
import {
  ServiceStatus,
  ServicePaymentStatus,
  ServicePriority,
  ServiceOrderListParams,
  ServiceOrder,
  calculateServiceStats,
} from '@/types/service';
import type { User } from '@/types/auth';

/**
 * Services Overview Page
 *
 * Main service management page showing all service orders across branches
 * with filtering, sorting, and pagination capabilities.
 */
export default function ServicesPage() {
  const { isAdmin } = useAuth();
  const showAllBranches = isAdmin();

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ServiceStatus | ''>('');
  const [selectedPriority, setSelectedPriority] = useState<ServicePriority | ''>('');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<ServicePaymentStatus | ''>('');
  const [selectedMechanic, setSelectedMechanic] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Sort state
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

  // Fetch data
  const { data: branchesData, isLoading: branchesLoading } = useBranches();
  const { data: mechanicsData, isLoading: mechanicsLoading } = useMechanics();

  // Build filters object
  const filters: ServiceOrderListParams = useMemo(() => {
    const f: ServiceOrderListParams = {
      page,
      limit,
      sortBy: sortField,
      sortOrder,
    };

    if (search) f.search = search;
    if (selectedStatus) f.status = selectedStatus;
    if (selectedPriority) f.priority = selectedPriority;
    if (selectedPaymentStatus) f.paymentStatus = selectedPaymentStatus;
    if (selectedMechanic) f.assignedTo = selectedMechanic;
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    if (selectedBranch) f.branch = selectedBranch;

    return f;
  }, [page, limit, sortField, sortOrder, search, selectedStatus, selectedPriority, selectedPaymentStatus, selectedMechanic, startDate, endDate, selectedBranch]);

  // Fetch service orders
  const {
    data: ordersData,
    isLoading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = useServiceOrders(filters);

  // Extract branches array from paginated response
  const branches = useMemo(() => {
    if (!branchesData) return [];
    return branchesData.data || [];
  }, [branchesData]);

  // Extract mechanics array
  const mechanics: User[] = useMemo(() => {
    if (!mechanicsData) return [];
    return mechanicsData;
  }, [mechanicsData]);

  // Extract orders and pagination from response
  const orders = useMemo(() => {
    return ordersData?.data || [];
  }, [ordersData]);

  const pagination = ordersData?.pagination;

  // Calculate stats from orders (client-side)
  const stats = useMemo(() => {
    return calculateServiceStats(orders);
  }, [orders]);

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
    setSelectedPriority('');
    setSelectedPaymentStatus('');
    setSelectedMechanic('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Handle assign mechanic click
  const handleAssignMechanic = useCallback((order: ServiceOrder) => {
    setSelectedOrder(order);
    setShowAssignModal(true);
  }, []);

  const handleCloseAssignModal = useCallback(() => {
    setShowAssignModal(false);
    setSelectedOrder(null);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
            <Wrench className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Service Orders
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage and track all service jobs
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
          <Link href="/services/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Service
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {ordersError && (
        <Alert variant="error">
          Failed to load service orders: {ordersError.message}
        </Alert>
      )}

      {/* Stats Cards */}
      <ServiceStatsCards
        stats={stats}
        isLoading={ordersLoading}
      />

      {/* Filters */}
      <ServiceFilters
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
        priority={selectedPriority}
        onPriorityChange={(priority) => {
          setSelectedPriority(priority);
          setPage(1);
        }}
        paymentStatus={selectedPaymentStatus}
        onPaymentStatusChange={(status) => {
          setSelectedPaymentStatus(status);
          setPage(1);
        }}
        mechanicId={selectedMechanic}
        onMechanicChange={(mechanic) => {
          setSelectedMechanic(mechanic);
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
        mechanics={mechanics}
        mechanicsLoading={mechanicsLoading}
        showBranchFilter={showAllBranches}
        onReset={handleResetFilters}
      />

      {/* Orders Table */}
      <ServiceOrderTable
        orders={orders}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        onAssignMechanic={handleAssignMechanic}
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
          Showing {orders.length} of {pagination?.total || orders.length} service orders
        </div>
      )}

      {/* Assign Mechanic Modal */}
      {selectedOrder && (
        <AssignMechanicModal
          isOpen={showAssignModal}
          onClose={handleCloseAssignModal}
          order={selectedOrder}
        />
      )}
    </div>
  );
}
