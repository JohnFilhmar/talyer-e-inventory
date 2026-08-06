'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { motorcycleModelLabel, type MotorcycleModel } from '@/types/motorcycleModel';

interface DeleteMotorcycleModelModalProps {
  motorcycleModel: MotorcycleModel | null;
  isOpen: boolean;
  isLoading?: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * DeleteMotorcycleModelModal component
 *
 * Confirmation modal for deactivating a motorcycle model. The server refuses
 * to remove one that products still reference, so the block is surfaced here
 * before the request rather than as a bare error afterwards.
 */
export const DeleteMotorcycleModelModal: React.FC<DeleteMotorcycleModelModalProps> = ({
  motorcycleModel,
  isOpen,
  isLoading = false,
  error = null,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !motorcycleModel) return null;

  const productCount = motorcycleModel.productCount ?? 0;
  const canDelete = productCount === 0;
  const label = motorcycleModelLabel(motorcycleModel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-6">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Warning Icon */}
        <div className="flex justify-center mb-4">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center ${
              canDelete ? 'bg-red-100' : 'bg-yellow-100'
            }`}
          >
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
          {canDelete ? 'Delete Motorcycle Model?' : 'Cannot Delete Motorcycle Model'}
        </h3>

        {/* Message */}
        <div className="text-center mb-6">
          {canDelete ? (
            <p className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>? It
              will stop appearing in product forms and filters.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span> is
                still used by{' '}
                <strong>
                  {productCount} product{productCount === 1 ? '' : 's'}
                </strong>
                .
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Remove it from those products first, so none of them is left claiming a fitment
                that no longer exists.
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {canDelete ? 'Cancel' : 'Close'}
          </Button>

          {canDelete && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

export default DeleteMotorcycleModelModal;
