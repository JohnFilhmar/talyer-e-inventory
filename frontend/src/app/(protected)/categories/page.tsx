'use client';

import React, { Suspense, useState, useCallback, useMemo } from 'react';
import { Plus, FolderTree, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useRootCategories,
  useDeleteCategory,
  useRestoreCategory,
} from '@/hooks/useCategories';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useHighlightNew } from '@/hooks/useHighlightNew';
import {
  CategoryTree,
  CategoryFormModal,
  DeleteCategoryModal,
} from '@/components/categories';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import type { Category } from '@/types/category';

/**
 * Module-level so `useUrlFilters` can memoise on its identity — a fresh literal
 * per render would rebuild `filters` every render.
 */
const CATEGORY_FILTER_DEFAULTS = { archived: false };

/**
 * Ids from the root down to (but not including) `targetId`.
 *
 * Module scope rather than a `useCallback`: it recurses, and the project's
 * React Compiler lint rejects a hook-declared value referring to itself.
 */
function findAncestorPath(
  nodes: Category[],
  targetId: string,
  trail: string[] = []
): string[] | null {
  for (const node of nodes) {
    if (node._id === targetId) return trail;
    const found = node.children
      ? findAncestorPath(node.children, targetId, [...trail, node._id])
      : null;
    if (found) return found;
  }
  return null;
}

/**
 * Categories management page
 *
 * Features:
 * - Hierarchical tree view of all categories
 * - Admin can create, edit, and delete categories
 * - Color-coded categories with pre-defined palette
 * - Add subcategories directly from parent
 */
function CategoriesPageContent() {
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [parentCategory, setParentCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  // Archived categories are hidden by default and revealed on request. The
  // toggle lives in the URL so a refresh, a shared link and the Back button all
  // restore the same view.
  const { filters, setFilters } = useUrlFilters(CATEGORY_FILTER_DEFAULTS);
  const showArchived = filters.archived;

  const { highlightedId, highlight, getHighlightProps } = useHighlightNew();
  const { show } = useToast();
  // The nonce is what makes a repeat create work: two subcategories created
  // under the same parent yield the same `path`, so the tree would see no
  // change and skip the expansion the second time round.
  const [expandRequest, setExpandRequest] = useState<{ nonce: number; path: string[] }>({
    nonce: 0,
    path: [],
  });

  // Fetch root categories with children populated
  const { data: categories, isLoading, error, refetch } = useRootCategories(showArchived);

  // The `active` filter applies to the roots the server selects; `children` is
  // a populated virtual and is not filtered by it, so an archived subcategory
  // would still arrive under a live parent. Prune it here so the tree matches
  // what the toggle promises.
  const visibleCategories = useMemo(() => {
    if (showArchived) return categories ?? [];

    const prune = (nodes: Category[]): Category[] =>
      nodes
        .filter((node) => node.isActive)
        .map((node) => ({
          ...node,
          children: node.children ? prune(node.children) : node.children,
        }));

    return prune(categories ?? []);
  }, [categories, showArchived]);


  // Delete mutation
  const deleteMutation = useDeleteCategory();
  const restoreMutation = useRestoreCategory();

  const handleRestoreCategory = useCallback(
    async (category: Category) => {
      try {
        await restoreMutation.mutateAsync(category._id);
      } catch {
        // Surfaced by the mutation's error state below.
      }
    },
    [restoreMutation]
  );

  // Handlers
  const handleAddCategory = useCallback(() => {
    setEditingCategory(null);
    setParentCategory(null);
    setShowFormModal(true);
  }, []);

  const handleAddSubcategory = useCallback((parent: Category) => {
    setEditingCategory(null);
    setParentCategory(parent);
    setShowFormModal(true);
  }, []);

  const handleEditCategory = useCallback((category: Category) => {
    setEditingCategory(category);
    setParentCategory(null);
    setShowFormModal(true);
  }, []);

  const handleDeleteCategory = useCallback((category: Category) => {
    setDeletingCategory(category);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingCategory) return;

    try {
      const parentId = typeof deletingCategory.parent === 'object' 
        ? deletingCategory.parent?._id 
        : deletingCategory.parent;
      
      await deleteMutation.mutateAsync({
        id: deletingCategory._id,
        parentId: parentId ?? undefined,
      });
      setDeletingCategory(null);
    } catch {
      // Error handled by mutation state
    }
  }, [deletingCategory, deleteMutation]);

  const handleFormClose = useCallback(() => {
    setShowFormModal(false);
    setEditingCategory(null);
    setParentCategory(null);
  }, []);

  const handleFormSuccess = useCallback(
    async (saved: Category, isCreate: boolean) => {
      handleFormClose();
      // The tree must hold the new node before its ancestors can be located or
      // its row scrolled to, so wait for the refetch rather than firing and
      // hoping.
      const { data: fresh } = await refetch();

      // Only a create is "new". An edit gets the toast and nothing else —
      // painting a New badge on a record the user just changed would be a lie,
      // and the scroll-to comes from the same highlight ref, so it goes too.
      if (isCreate) {
        const path = findAncestorPath(fresh ?? [], saved._id) ?? [];
        setExpandRequest((current) => ({ nonce: current.nonce + 1, path }));
        highlight(saved._id);
      }

      show(`Saved "${saved.name}"`);
    },
    [refetch, highlight, show, handleFormClose]
  );

  const handleDeleteClose = useCallback(() => {
    setDeletingCategory(null);
    deleteMutation.reset();
  }, [deleteMutation]);

  // Check if user has access (all authenticated users can view categories)
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
            <FolderTree className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Categories
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Organize products into hierarchical categories
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setFilters({ archived: !showArchived }, 'push')}
            aria-pressed={showArchived}
          >
            {showArchived ? (
              <EyeOff className="w-4 h-4 mr-2" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>

          {showAdminActions && (
            <Button variant="primary" onClick={handleAddCategory}>
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      {visibleCategories.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Root Categories</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {visibleCategories.length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Categories</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {countTotalCategories(visibleCategories)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {countActiveCategories(visibleCategories)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">With Products</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {countCategoriesWithProducts(visibleCategories)}
            </p>
          </div>
        </div>
      )}

      {/* Restore has no confirmation step, so its failures have nowhere else
          to surface. */}
      {restoreMutation.error && (
        <Alert variant="error" className="mb-4">
          {restoreMutation.error.message}
        </Alert>
      )}

      {/* Category Tree */}
      <CategoryTree
        categories={visibleCategories}
        isLoading={isLoading}
        error={error}
        onEdit={showAdminActions ? handleEditCategory : undefined}
        onDelete={showAdminActions ? handleDeleteCategory : undefined}
        onRestore={showAdminActions ? handleRestoreCategory : undefined}
        restoringId={restoreMutation.isPending ? restoreMutation.variables : null}
        onAddChild={showAdminActions ? handleAddSubcategory : undefined}
        isAdmin={showAdminActions}
        expandRequest={expandRequest}
        highlightedId={highlightedId}
        getHighlightProps={getHighlightProps}
      />

      {/* Form Modal */}
      <CategoryFormModal
        isOpen={showFormModal}
        category={editingCategory}
        parentCategory={parentCategory}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Modal */}
      <DeleteCategoryModal
        category={deletingCategory}
        isOpen={!!deletingCategory}
        isLoading={deleteMutation.isPending}
        error={deleteMutation.error}
        onClose={handleDeleteClose}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

/**
 * `useUrlFilters` reads `useSearchParams()`, which opts the route into client
 * rendering; without a boundary the build fails on the prerender pass.
 */
export default function CategoriesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Spinner size="lg" /></div>}>
      <CategoriesPageContent />
    </Suspense>
  );
}

/**
 * Helper function to count total categories including children
 */
function countTotalCategories(categories: Category[]): number {
  let count = 0;
  for (const category of categories) {
    count += 1;
    if (category.children) {
      count += countTotalCategories(category.children);
    }
  }
  return count;
}

/**
 * Helper function to count active categories
 */
function countActiveCategories(categories: Category[]): number {
  let count = 0;
  for (const category of categories) {
    if (category.isActive) count += 1;
    if (category.children) {
      count += countActiveCategories(category.children);
    }
  }
  return count;
}

/**
 * Helper function to count categories with products
 */
function countCategoriesWithProducts(categories: Category[]): number {
  let count = 0;
  for (const category of categories) {
    if (category.productCount && category.productCount > 0) count += 1;
    if (category.children) {
      count += countCategoriesWithProducts(category.children);
    }
  }
  return count;
}
