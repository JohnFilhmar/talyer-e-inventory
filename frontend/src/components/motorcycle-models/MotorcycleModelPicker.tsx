'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useActiveMotorcycleModels, groupByMake } from '@/hooks/useMotorcycleModels';
import { motorcycleModelLabel, type MotorcycleModel } from '@/types/motorcycleModel';

interface MotorcycleModelPickerProps {
  /** Selected motorcycle model ids */
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  /**
   * Models already selected but no longer in the active list — a product
   * tagged with a since-deactivated motorcycle. Passed in so its chip still
   * renders with a name instead of a bare id, and can be removed.
   */
  fallbackLabels?: Record<string, string>;
  error?: string;
}

/**
 * MotorcycleModelPicker component
 *
 * Appendable multi-select, deliberately shaped like the tag input next to it
 * in the product form: pick from the dropdown, the choice becomes a chip, the
 * chip's × removes it. Selected entries drop out of the dropdown so the same
 * motorcycle cannot be added twice.
 *
 * The dropdown is grouped by make — a shop with 200 fitments is unusable as
 * one flat list.
 */
export const MotorcycleModelPicker: React.FC<MotorcycleModelPickerProps> = ({
  value,
  onChange,
  disabled = false,
  label = 'Fits Motorcycles',
  helperText,
  fallbackLabels,
  error,
}) => {
  const { data: motorcycleModels, isLoading } = useActiveMotorcycleModels();

  const byId = useMemo(() => {
    const map = new Map<string, MotorcycleModel>();
    for (const motorcycleModel of motorcycleModels ?? []) {
      map.set(motorcycleModel._id, motorcycleModel);
    }
    return map;
  }, [motorcycleModels]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const availableGroups = useMemo(() => {
    const available = (motorcycleModels ?? []).filter((m) => !selectedSet.has(m._id));
    return groupByMake(available);
  }, [motorcycleModels, selectedSet]);

  const handleAdd = (id: string) => {
    if (!id || selectedSet.has(id)) return;
    onChange([...value, id]);
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((selected) => selected !== id));
  };

  const labelFor = (id: string): string => {
    const motorcycleModel = byId.get(id);
    if (motorcycleModel) return motorcycleModelLabel(motorcycleModel);
    return fallbackLabels?.[id] ?? 'Unknown motorcycle';
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>

      {isLoading ? (
        <div className="flex items-center gap-2 p-2">
          <Spinner size="sm" />
          <span className="text-sm text-gray-500">Loading motorcycle models...</span>
        </div>
      ) : (
        <select
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent disabled:opacity-50"
          // Always reset to the placeholder: this select is an "add" action,
          // not a bound field. Leaving the last pick shown would read as a
          // single-value selection when the real state is the chip list below.
          value=""
          onChange={(e) => handleAdd(e.target.value)}
          disabled={disabled}
        >
          <option value="">
            {availableGroups.length === 0
              ? 'No more motorcycle models to add'
              : 'Add a motorcycle model...'}
          </option>
          {availableGroups.map(({ make, models }) => (
            <optgroup key={make} label={make}>
              {models.map((motorcycleModel) => (
                <option key={motorcycleModel._id} value={motorcycleModel._id}>
                  {motorcycleModelLabel(motorcycleModel)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-sm"
            >
              {labelFor(id)}
              <button
                type="button"
                onClick={() => handleRemove(id)}
                disabled={disabled}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50"
                aria-label={`Remove ${labelFor(id)}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {helperText && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default MotorcycleModelPicker;
