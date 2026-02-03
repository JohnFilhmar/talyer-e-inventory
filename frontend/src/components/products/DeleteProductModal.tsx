'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import type { Product } from '@/types/product';

interface DeleteProductModalProps {
  product: Product | null;
  isOpen: boolean;
  isLoading?: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * DeleteProductModal component
 * 
 * Confirmation modal for deleting/archiving a product
 */
export const DeleteProductModal: React.FC<DeleteProductModalProps> = ({
  product,
  isOpen,
  isLoading = false,
  error = null,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !product) return null;

  const isArchive = product.isActive;
  const title = isArchive ? 'Archive Product?' : 'Delete Product?';
  const actionText = isArchive ? 'Archive' : 'Delete';
  const actioningText = isArchive ? 'Archiving...' : 'Deleting...';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Warning Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isArchive ? 'bg-yellow-100' : 'bg-red-100'}`}>
            <svg
              className={`w-8 h-8 ${isArchive ? 'text-yellow-600' : 'text-red-600'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isArchive ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              )}
            </svg>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
          {title}
        </h3>

        {/* Message */}
        <div className="text-center mb-6">
          {isArchive ? (
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {product.name}
              </span>{' '}
              will be marked as inactive and hidden from listings. You can reactivate it later.
            </p>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {product.name}
              </span>
              ? This action cannot be undone.
            </p>
          )}
        </div>

        {/* Product Info */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">SKU:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">{product.sku}</span>
            </div>
            {product.brand && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Brand:</span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">{product.brand}</span>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="error" className="mb-4">
            {error.message}
          </Alert>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`
              px-4 py-2 text-sm font-medium text-white rounded-md 
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed 
              flex items-center gap-2
              ${isArchive
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-red-600 hover:bg-red-700'
              }
            `}
          >
            {isLoading && <Spinner size="sm" />}
            {isLoading ? actioningText : actionText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteProductModal;
