'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import type { Category } from '@/types/category';

interface DeleteCategoryModalProps {
  category: Category | null;
  isOpen: boolean;
  isLoading?: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * DeleteCategoryModal component
 * 
 * Confirmation modal for deleting a category
 * Warns about products and children
 */
export const DeleteCategoryModal: React.FC<DeleteCategoryModalProps> = ({
  category,
  isOpen,
  isLoading = false,
  error = null,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !category) return null;

  const hasChildren = category.children && category.children.length > 0;
  const hasProducts = category.productCount && category.productCount > 0;
  const canDelete = !hasChildren && !hasProducts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Warning Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${canDelete ? 'bg-red-100' : 'bg-yellow-100'}`}>
            <svg
              className={`w-8 h-8 ${canDelete ? 'text-red-600' : 'text-yellow-600'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {canDelete ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              )}
            </svg>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
          {canDelete ? 'Delete Category?' : 'Cannot Delete Category'}
        </h3>

        {/* Message */}
        <div className="text-center mb-6">
          {canDelete ? (
            <p className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {category.name}
              </span>
              ? This action cannot be undone.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {category.name}
                </span>{' '}
                cannot be deleted because:
              </p>
              
              <ul className="text-left text-sm space-y-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                {hasChildren && (
                  <li className="flex items-start gap-2 text-yellow-800 dark:text-yellow-200">
                    <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span>
                      Has <strong>{category.children!.length}</strong> subcategor{category.children!.length === 1 ? 'y' : 'ies'}
                    </span>
                  </li>
                )}
                {hasProducts && (
                  <li className="flex items-start gap-2 text-yellow-800 dark:text-yellow-200">
                    <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>
                      Has <strong>{category.productCount}</strong> product{category.productCount === 1 ? '' : 's'} assigned
                    </span>
                  </li>
                )}
              </ul>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please reassign or delete these items first before removing this category.
              </p>
            </div>
          )}
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
            {canDelete ? 'Cancel' : 'Close'}
          </Button>
          
          {canDelete && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading && <Spinner size="sm" />}
              {isLoading ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeleteCategoryModal;
