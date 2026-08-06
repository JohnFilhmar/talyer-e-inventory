'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Plus, Bike, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMotorcycleModels, useDeleteMotorcycleModel } from '@/hooks/useMotorcycleModels';
import {
  MotorcycleModelList,
  MotorcycleModelFormModal,
  DeleteMotorcycleModelModal,
} from '@/components/motorcycle-models';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { motorcycleModelLabel, type MotorcycleModel } from '@/types/motorcycleModel';

/**
 * Motorcycle models management page
 *
 * The counterpart to /categories: a category says what a part *is*, a
 * motorcycle model says what it *fits*. Products reference many of these,
 * appendable like tags.
 *
 * Features:
 * - Models grouped by make
 * - Admin can create, edit and deactivate
 * - Client-side filter box over the loaded list
 */
export default function MotorcycleModelsPage() {
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingModel, setEditingModel] = useState<MotorcycleModel | null>(null);
  const [deletingModel, setDeletingModel] = useState<MotorcycleModel | null>(null);

  // Filter box. Filtering happens client-side over the already-loaded list
  // rather than through the API: the whole catalog of motorcycles is small and
  // fully cached, so a round trip per keystroke buys nothing and breaks
  // offline.
  const [search, setSearch] = useState('');

  const { data: motorcycleModels, isLoading, error, refetch } = useMotorcycleModels();

  const deleteMutation = useDeleteMotorcycleModel();

  const filtered = useMemo(() => {
    const all = motorcycleModels ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;

    return all.filter((motorcycleModel) =>
      motorcycleModelLabel(motorcycleModel).toLowerCase().includes(term)
    );
  }, [motorcycleModels, search]);

  const stats = useMemo(() => {
    const all = motorcycleModels ?? [];
    return {
      total: all.length,
      makes: new Set(all.map((m) => m.make)).size,
      active: all.filter((m) => m.isActive).length,
      withProducts: all.filter((m) => (m.productCount ?? 0) > 0).length,
    };
  }, [motorcycleModels]);

  // Handlers
  const handleAdd = useCallback(() => {
    setEditingModel(null);
    setShowFormModal(true);
  }, []);

  const handleEdit = useCallback((motorcycleModel: MotorcycleModel) => {
    setEditingModel(motorcycleModel);
    setShowFormModal(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setShowFormModal(false);
    setEditingModel(null);
  }, []);

  const handleFormSuccess = useCallback(() => {
    refetch();
    handleFormClose();
  }, [refetch, handleFormClose]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingModel) return;

    try {
      await deleteMutation.mutateAsync(deletingModel._id);
      setDeletingModel(null);
    } catch {
      // Error handled by mutation state
    }
  }, [deletingModel, deleteMutation]);

  const handleDeleteClose = useCallback(() => {
    setDeletingModel(null);
    deleteMutation.reset();
  }, [deleteMutation]);

  if (!user) {
    return (
      <div className="text-center py-12">
        <Alert variant="error">Please log in to view this page.</Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
            <Bike className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Motorcycle Models
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The motorcycles your products fit
            </p>
          </div>
        </div>

        {showAdminActions && (
          <Button variant="primary" onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Motorcycle Model
          </Button>
        )}
      </div>

      {/* Stats Summary */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Makes</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.makes}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Models</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.active}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">With Products</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.withProducts}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {stats.total > 0 && (
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search make or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* List */}
      <MotorcycleModelList
        motorcycleModels={filtered}
        isLoading={isLoading}
        error={error}
        isAdmin={showAdminActions}
        onEdit={showAdminActions ? handleEdit : undefined}
        onDelete={showAdminActions ? setDeletingModel : undefined}
      />

      {/* Form Modal */}
      <MotorcycleModelFormModal
        isOpen={showFormModal}
        motorcycleModel={editingModel}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Modal */}
      <DeleteMotorcycleModelModal
        motorcycleModel={deletingModel}
        isOpen={!!deletingModel}
        isLoading={deleteMutation.isPending}
        error={deleteMutation.error}
        onClose={handleDeleteClose}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
