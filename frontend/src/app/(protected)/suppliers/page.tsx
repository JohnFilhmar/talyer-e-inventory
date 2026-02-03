'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Building2, Plus, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeactivateSupplier,
} from '@/hooks/useSuppliers';
import { SupplierList, SupplierFormModal } from '@/components/suppliers';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import type { Supplier, CreateSupplierPayload, UpdateSupplierPayload } from '@/types/supplier';
import type { CreateSupplierFormData, UpdateSupplierFormData } from '@/utils/validators/supplier';

/**
 * Suppliers Page
 * 
 * Manage supplier network.
 */
export default function SuppliersPage() {
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Filter state
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Fetch data
  const suppliersQuery = useSuppliers({
    active: showInactive ? undefined : 'true',
  });

  // Mutations
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const deactivateMutation = useDeactivateSupplier();

  // Extract suppliers array from paginated response
  const suppliers = useMemo(() => {
    const data = suppliersQuery.data;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ('data' in data) return data.data;
    return [];
  }, [suppliersQuery.data]);

  // Filter suppliers by search
  const filteredSuppliers = useMemo(() => {
    if (!search) return suppliers;
    
    const searchLower = search.toLowerCase();
    return suppliers.filter((s) => 
      s.name.toLowerCase().includes(searchLower) ||
      s.code?.toLowerCase().includes(searchLower) ||
      s.contact?.personName?.toLowerCase().includes(searchLower) ||
      s.contact?.email?.toLowerCase().includes(searchLower)
    );
  }, [suppliers, search]);

  // Handlers
  const handleCreateOrUpdate = useCallback(async (data: CreateSupplierFormData | UpdateSupplierFormData) => {
    if (editingSupplier) {
      await updateMutation.mutateAsync({
        id: editingSupplier._id,
        payload: data as UpdateSupplierPayload,
      });
    } else {
      await createMutation.mutateAsync(data as CreateSupplierPayload);
    }
    setEditingSupplier(null);
    setShowFormModal(false);
  }, [editingSupplier, createMutation, updateMutation]);

  const handleEdit = useCallback((supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowFormModal(true);
  }, []);

  const handleDeactivate = useCallback(async (supplier: Supplier) => {
    if (!window.confirm(`Are you sure you want to deactivate ${supplier.name}?`)) {
      return;
    }
    await deactivateMutation.mutateAsync(supplier._id);
  }, [deactivateMutation]);

  const handleRefresh = useCallback(() => {
    suppliersQuery.refetch();
  }, [suppliersQuery]);

  const handleCloseModal = useCallback(() => {
    setShowFormModal(false);
    setEditingSupplier(null);
  }, []);

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
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Suppliers
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage your supplier network
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={suppliersQuery.isLoading || suppliersQuery.isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${suppliersQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {showAdminActions && (
            <Button
              variant="primary"
              onClick={() => setShowFormModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code, contact, or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Show Inactive Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 text-yellow-500 rounded focus:ring-yellow-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Show inactive
            </span>
          </label>
        </div>
      </div>

      {/* Error Display */}
      {suppliersQuery.error && (
        <Alert variant="error" title="Error loading suppliers">
          {suppliersQuery.error.message}
        </Alert>
      )}

      {/* Supplier List */}
      <SupplierList
        suppliers={filteredSuppliers}
        isLoading={suppliersQuery.isLoading}
        onEdit={showAdminActions ? handleEdit : undefined}
        onDeactivate={showAdminActions ? handleDeactivate : undefined}
        showActions={showAdminActions}
      />

      {/* Stats */}
      {filteredSuppliers.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Showing {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Form Modal */}
      <SupplierFormModal
        isOpen={showFormModal}
        onClose={handleCloseModal}
        supplier={editingSupplier}
        onSubmit={handleCreateOrUpdate}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={createMutation.error || updateMutation.error}
      />
    </div>
  );
}
