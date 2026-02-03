'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProducts, useDeleteProduct } from '@/hooks/useProducts';
import { ProductGrid, ProductFilters, DeleteProductModal } from '@/components/products';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import type { Product, ProductListParams } from '@/types/product';

/**
 * Products list page
 * 
 * Features:
 * - Product grid with responsive layout
 * - Advanced filters (category, brand, price range, status)
 * - Debounced search (600ms)
 * - Pagination
 * - Admin can add, edit, and delete products
 */
export default function ProductsPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Filter state
  const [filters, setFilters] = useState<ProductListParams>({
    page: 1,
    limit: 12,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  // Modal state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // Fetch products
  const { data, isLoading, error, refetch } = useProducts(filters);
  const products = data?.data ?? [];
  const pagination = data?.pagination;

  // Delete mutation
  const deleteMutation = useDeleteProduct();

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

  const handleFilterChange = useCallback((newFilters: ProductListParams) => {
    setFilters(newFilters);
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilters({
      page: 1,
      limit: 12,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
        onReset={handleFilterReset}
      />

      {/* Product Grid */}
      <ProductGrid
        products={products}
        isLoading={isLoading}
        error={error}
        onEdit={showAdminActions ? handleEditProduct : undefined}
        onDelete={showAdminActions ? handleDeleteProduct : undefined}
        isAdmin={showAdminActions}
        emptyMessage={
          Object.keys(filters).some(k => !['page', 'limit', 'sortBy', 'sortOrder'].includes(k) && filters[k as keyof ProductListParams])
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
