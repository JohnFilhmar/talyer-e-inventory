'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useBranches,
  useDeactivateBranch,
} from '@/hooks/useBranches';
import { BranchCard, BranchFormModal, DeactivateModal } from '@/components/branches';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import type { Branch, BranchListParams } from '@/types/branch';

type FilterStatus = 'all' | 'active' | 'inactive';

/**
 * Branches list page
 * 
 * Features:
 * - List all branches with search and filters
 * - Admin can create, edit, and deactivate branches
 * - Role-based access (admin and salesperson can view)
 */
export default function BranchesPage() {
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Filter state
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [page, setPage] = useState(1);

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deactivatingBranch, setDeactivatingBranch] = useState<Branch | null>(null);

  // Build query params
  const queryParams: BranchListParams = {
    search: search || undefined,
    active: filterStatus === 'all' ? undefined : filterStatus === 'active' ? 'true' : 'false',
    page,
    limit: 20,
  };

  // Fetch branches
  const { data, isLoading, error, refetch } = useBranches(queryParams);
  const branches = data?.data ?? [];
  const pagination = data?.pagination;

  // Deactivate mutation
  const deactivateMutation = useDeactivateBranch();

  // Handlers
  const handleAddBranch = useCallback(() => {
    setEditingBranch(null);
    setShowFormModal(true);
  }, []);

  const handleEditBranch = useCallback((branch: Branch) => {
    setEditingBranch(branch);
    setShowFormModal(true);
  }, []);

  const handleDeactivateBranch = useCallback((branch: Branch) => {
    setDeactivatingBranch(branch);
  }, []);

  const handleConfirmDeactivate = useCallback(async () => {
    if (!deactivatingBranch) return;

    try {
      await deactivateMutation.mutateAsync(deactivatingBranch._id);
      setDeactivatingBranch(null);
    } catch {
      // Error handled by mutation state
    }
  }, [deactivatingBranch, deactivateMutation]);

  const handleFormSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  }, []);

  const handleFilterChange = useCallback((status: FilterStatus) => {
    setFilterStatus(status);
    setPage(1); // Reset to first page on filter change
  }, []);

  // Check if user has access
  if (!user || (user.role !== 'admin' && user.role !== 'salesperson')) {
    return (
      <div className="text-center py-12">
        <Alert variant="error">
          You do not have permission to view this page.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Branches</h1>
          <p className="text-gray-600">Manage branch locations and information</p>
        </div>
        {showAdminActions && (
          <Button variant="primary" onClick={handleAddBranch}>
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Branch
            </span>
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, code, or city..."
              value={search}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2">
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filterStatus === 'all'
                ? 'bg-yellow-400 text-black'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleFilterChange('active')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filterStatus === 'active'
                ? 'bg-yellow-400 text-black'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => handleFilterChange('inactive')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filterStatus === 'inactive'
                ? 'bg-yellow-400 text-black'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="error">
          Failed to load branches: {error.message}
        </Alert>
      )}

      {/* Deactivate Error */}
      {deactivateMutation.error && (
        <Alert variant="error">
          {deactivateMutation.error.message}
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && branches.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <svg
            className="w-16 h-16 mx-auto text-gray-300 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No branches found</h3>
          <p className="text-gray-500 mb-4">
            {search || filterStatus !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Get started by adding your first branch.'}
          </p>
          {showAdminActions && !search && filterStatus === 'all' && (
            <Button variant="primary" onClick={handleAddBranch}>
              Add Branch
            </Button>
          )}
        </div>
      )}

      {/* Branch Grid */}
      {!isLoading && branches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <BranchCard
              key={branch._id}
              branch={branch}
              onEdit={showAdminActions ? handleEditBranch : undefined}
              onDeactivate={showAdminActions ? handleDeactivateBranch : undefined}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-700">
            Page {page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Branch Form Modal */}
      <BranchFormModal
        isOpen={showFormModal}
        branch={editingBranch}
        onClose={() => {
          setShowFormModal(false);
          setEditingBranch(null);
        }}
        onSuccess={handleFormSuccess}
      />

      {/* Deactivate Confirmation Modal */}
      <DeactivateModal
        isOpen={!!deactivatingBranch}
        branchName={deactivatingBranch?.name ?? ''}
        isLoading={deactivateMutation.isPending}
        onClose={() => setDeactivatingBranch(null)}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}
