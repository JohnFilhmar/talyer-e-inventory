'use client';

import React from 'react';
import { Package } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import type { Product } from '@/types/product';

interface ProductGridProps {
  products: Product[];
  isLoading?: boolean;
  error?: Error | null;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  isAdmin?: boolean;
  emptyMessage?: string;
}

/**
 * ProductGrid component
 * 
 * Displays products in a responsive grid layout
 */
export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  isLoading = false,
  error = null,
  onEdit,
  onDelete,
  isAdmin = false,
  emptyMessage = 'No products found',
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-500">Loading products...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Error loading products">
        {error.message}
      </Alert>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          {emptyMessage}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          {isAdmin
            ? 'Get started by adding your first product.'
            : 'Check back later or try different filters.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard
          key={product._id}
          product={product}
          onEdit={onEdit}
          onDelete={onDelete}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
};
