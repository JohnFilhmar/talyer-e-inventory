'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Truck, Plus, RefreshCw, Filter } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import {
  useStock,
  useTransfers,
  useCreateTransfer,
  useUpdateTransferStatus,
} from '@/hooks/useStock';
import { TransferList, CreateTransferModal } from '@/components/stock';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import type { TransferStatus, CreateTransferPayload } from '@/types/stock';
import type { CreateTransferFormData } from '@/utils/validators/stock';

/**
 * Stock Transfers Page
 * 
 * Manage stock transfers between branches.
 */
export default function TransfersPage() {
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<TransferStatus | ''>('');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch data
  const { data: branchesData } = useBranches();
  const stockQuery = useStock();
  const transfersQuery = useTransfers(
    statusFilter ? { status: statusFilter } : {}
  );

  // Mutations
  const createMutation = useCreateTransfer();
  const updateStatusMutation = useUpdateTransferStatus();

  // Extract arrays from paginated responses
  const branches = useMemo(() => {
    if (!branchesData) return [];
    return 'data' in branchesData ? branchesData.data : branchesData;
  }, [branchesData]);

  const stocks = useMemo(() => {
    const data = stockQuery.data;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ('data' in data) return data.data;
    return [];
  }, [stockQuery.data]);

  const transfers = useMemo(() => {
    const data = transfersQuery.data;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ('data' in data) return data.data;
    return [];
  }, [transfersQuery.data]);

  // Handlers
  const handleCreateTransfer = useCallback(async (data: CreateTransferFormData) => {
    const payload: CreateTransferPayload = {
      product: data.product,
      fromBranch: data.fromBranch,
      toBranch: data.toBranch,
      quantity: data.quantity,
      notes: data.notes || undefined,
    };
    await createMutation.mutateAsync(payload);
  }, [createMutation]);

  const handleStatusUpdate = useCallback(async (transferId: string, status: TransferStatus) => {
    await updateStatusMutation.mutateAsync({
      transferId,
      payload: { status },
    });
  }, [updateStatusMutation]);

  const handleRefresh = useCallback(() => {
    transfersQuery.refetch();
  }, [transfersQuery]);

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
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Truck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Stock Transfers
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage inventory transfers between branches
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={transfersQuery.isLoading || transfersQuery.isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${transfersQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {showAdminActions && (
            <Button
              variant="primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Transfer
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Filter by Status:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${!statusFilter 
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-500' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              All
            </button>
            {(['pending', 'in-transit', 'completed', 'cancelled'] as TransferStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors capitalize
                  ${statusFilter === status 
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-500' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
              >
                {status === 'in-transit' ? 'In Transit' : status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {transfersQuery.error && (
        <Alert variant="error" title="Error loading transfers">
          {transfersQuery.error.message}
        </Alert>
      )}

      {/* Transfer List */}
      <TransferList
        transfers={transfers}
        isLoading={transfersQuery.isLoading}
        onStatusUpdate={showAdminActions ? handleStatusUpdate : undefined}
        isUpdating={updateStatusMutation.isPending}
        showActions={showAdminActions}
      />

      {/* Stats */}
      {transfers.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Showing {transfers.length} transfer{transfers.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Create Transfer Modal */}
      <CreateTransferModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        branches={branches}
        stocks={stocks}
        onCreateTransfer={handleCreateTransfer}
        isLoading={createMutation.isPending}
        error={createMutation.error}
      />
    </div>
  );
}
