'use client';

import React from 'react';
import { Bike } from 'lucide-react';
import {
  isPopulatedMotorcycleModel,
  motorcycleModelLabel,
  type ProductMotorcycleModel,
} from '@/types/motorcycleModel';

interface MotorcycleModelBadgesProps {
  motorcycleModels?: Array<ProductMotorcycleModel | string>;
  /** Cap the number of chips shown, with a "+N more" tail. Omit for all. */
  max?: number;
  className?: string;
  showIcon?: boolean;
}

/**
 * Read-only chips for the motorcycles a product fits.
 *
 * Unpopulated references (bare id strings) are skipped rather than rendered:
 * an id tells the user nothing, and showing one would look like data
 * corruption on a screen that simply forgot to populate.
 */
export const MotorcycleModelBadges: React.FC<MotorcycleModelBadgesProps> = ({
  motorcycleModels,
  max,
  className = '',
  showIcon = true,
}) => {
  const populated = (motorcycleModels ?? []).filter(isPopulatedMotorcycleModel);

  if (populated.length === 0) return null;

  const shown = max === undefined ? populated : populated.slice(0, max);
  const hidden = populated.length - shown.length;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {showIcon && <Bike className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
      {shown.map((motorcycleModel) => (
        <span
          key={motorcycleModel._id}
          className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs"
        >
          {motorcycleModelLabel(motorcycleModel)}
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">+{hidden} more</span>
      )}
    </div>
  );
};

export default MotorcycleModelBadges;
