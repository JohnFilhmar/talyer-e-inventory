'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Package, Tag, Edit, Trash2, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { calculateProfitMargin, isPopulatedCategory } from '@/types/product';
import type { Product } from '@/types/product';

interface ProductCardProps {
  product: Product;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  isAdmin?: boolean;
}

/**
 * Resolve image URL - handles both full URLs and legacy relative paths
 */
function resolveImageUrl(url: string): string {
  // Already a full URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Relative path from old uploads - prepend backend URL
  if (url.startsWith('/uploads/')) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    return `${backendUrl}${url}`;
  }
  return url;
}

/**
 * Format price in Philippine Peso
 */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * ProductCard component
 * 
 * Displays product information in a card format
 */
export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onEdit,
  onDelete,
  isAdmin = false,
}) => {
  const profitMargin = calculateProfitMargin(product.costPrice, product.sellingPrice);
  const categoryName = isPopulatedCategory(product.category) 
    ? product.category.name 
    : 'Uncategorized';
  const categoryColor = isPopulatedCategory(product.category) 
    ? product.category.color 
    : undefined;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow group">
      {/* Image */}
      <Link href={`/products/${product._id}`}>
        <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
          {product.primaryImage || (product.images && product.images.length > 0) ? (
            <Image
              src={resolveImageUrl(product.primaryImage ?? product.images[0].url)}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Package className="w-16 h-16 text-gray-300 dark:text-gray-600" />
            </div>
          )}

          {/* Status badges */}
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {!product.isActive && (
              <Badge variant="warning" size="sm">Inactive</Badge>
            )}
            {product.isDiscontinued && (
              <Badge variant="error" size="sm">Discontinued</Badge>
            )}
          </div>
        </div>
      </Link>

      {/* Content */}
      <div className="p-4">
        {/* Category */}
        <div className="flex items-center gap-1.5 mb-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: categoryColor ?? '#6B7280' }}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {categoryName}
          </span>
        </div>

        {/* Name and SKU */}
        <Link href={`/products/${product._id}`}>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          SKU: {product.sku}
        </p>

        {/* Brand/Model */}
        {(product.brand || product.model) && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 truncate">
            {product.brand}{product.brand && product.model && ' • '}{product.model}
          </p>
        )}

        {/* Prices */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatPrice(product.sellingPrice)}
            </span>
            <Badge 
              variant={profitMargin >= 20 ? 'success' : profitMargin >= 10 ? 'warning' : 'error'}
              size="sm"
            >
              {profitMargin.toFixed(1)}% margin
            </Badge>
          </div>
          {isAdmin && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Cost: {formatPrice(product.costPrice)}
            </p>
          )}
        </div>

        {/* Tags */}
        {product.tags && product.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-3 overflow-x-auto">
            <Tag className="w-3 h-3 text-gray-400 shrink-0" />
            {product.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded truncate"
              >
                {tag}
              </span>
            ))}
            {product.tags.length > 3 && (
              <span className="text-xs text-gray-400">+{product.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Admin Actions */}
        {isAdmin && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit?.(product)}
              className="flex-1"
            >
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete?.(product)}
              className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {product.isActive ? (
                <>
                  <Archive className="w-4 h-4 mr-1" />
                  Archive
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
