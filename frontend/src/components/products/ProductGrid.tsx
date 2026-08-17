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
  onRestore?: (product: Product) => void;
  restoringId?: string | null;
  isAdmin?: boolean;
  emptyMessage?: string;
  /** Id of a just-created product to ring and scroll to. From `useHighlightNew`. */
  highlightedId?: string | null;
  /** From `useHighlightNew` — spread onto each card wrapper below. */
  getHighlightProps?: (id: string) => {
    ref?: (node: HTMLElement | null) => void;
    className: string;
  };
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
  onRestore,
  restoringId = null,
  isAdmin = false,
  emptyMessage = 'No products found',
  highlightedId = null,
  getHighlightProps,
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
      {products.map((product) => {
        const highlightProps = getHighlightProps?.(product._id) ?? { className: '' };
        const isNew = highlightedId === product._id;

        return (
          <div
            key={product._id}
            ref={highlightProps.ref}
            className={`relative rounded-lg ${highlightProps.className}`}
          >
            {isNew && (
              <span className="absolute -top-2 -right-2 z-10 px-2 py-0.5 text-xs font-medium bg-yellow-400 text-black rounded-full">
                New
              </span>
            )}
            <ProductCard
              product={product}
              onEdit={onEdit}
              onDelete={onDelete}
              onRestore={onRestore}
              restoringId={restoringId}
              isAdmin={isAdmin}
            />
          </div>
        );
      })}
    </div>
  );
};
