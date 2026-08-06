'use client';

import React from 'react';
import { Bike, Pencil, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
  motorcycleModelLabel,
  type MotorcycleModel,
} from '@/types/motorcycleModel';
import { groupByMake } from '@/hooks/useMotorcycleModels';

interface MotorcycleModelListProps {
  motorcycleModels: MotorcycleModel[];
  isLoading?: boolean;
  error?: Error | null;
  isAdmin?: boolean;
  onEdit?: (motorcycleModel: MotorcycleModel) => void;
  onDelete?: (motorcycleModel: MotorcycleModel) => void;
}

/**
 * MotorcycleModelList component
 *
 * Grouped by make rather than a flat table: a shop carries a handful of makes
 * and dozens of models under each, so "all the Hondas together" is how the
 * list is actually read.
 */
export const MotorcycleModelList: React.FC<MotorcycleModelListProps> = ({
  motorcycleModels,
  isLoading = false,
  error = null,
  isAdmin = false,
  onEdit,
  onDelete,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Error loading motorcycle models">
        {error.message}
      </Alert>
    );
  }

  if (motorcycleModels.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <Bike className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400">No motorcycle models yet</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Add the motorcycles your shop stocks parts for, then tag products with them.
        </p>
      </div>
    );
  }

  const groups = groupByMake(motorcycleModels);

  return (
    <div className="space-y-6">
      {groups.map(({ make, models }) => (
        <div
          key={make}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{make}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {models.length} model{models.length === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {models.map((motorcycleModel) => (
              <li
                key={motorcycleModel._id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {motorcycleModelLabel(motorcycleModel)}
                    </span>
                    {!motorcycleModel.isActive && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                        Inactive
                      </span>
                    )}
                    {motorcycleModel.productCount !== undefined &&
                      motorcycleModel.productCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full">
                          {motorcycleModel.productCount} product
                          {motorcycleModel.productCount === 1 ? '' : 's'}
                        </span>
                      )}
                  </div>
                  {motorcycleModel.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {motorcycleModel.description}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(motorcycleModel)}
                        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                        aria-label={`Edit ${motorcycleModelLabel(motorcycleModel)}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(motorcycleModel)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                        aria-label={`Delete ${motorcycleModelLabel(motorcycleModel)}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default MotorcycleModelList;
