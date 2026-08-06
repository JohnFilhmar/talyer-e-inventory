'use client';

import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { createMotorcycleModelSchema } from '@/utils/validators/motorcycleModel';
import {
  useCreateMotorcycleModel,
  useUpdateMotorcycleModel,
  useMotorcycleMakes,
} from '@/hooks/useMotorcycleModels';
import type { MotorcycleModel } from '@/types/motorcycleModel';

/**
 * Form data type for the motorcycle model form
 */
interface MotorcycleModelFormData {
  make: string;
  model: string;
  yearFrom?: number;
  yearTo?: number;
  description?: string;
}

interface MotorcycleModelFormModalProps {
  isOpen: boolean;
  motorcycleModel?: MotorcycleModel | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const emptyForm: MotorcycleModelFormData = {
  make: '',
  model: '',
  yearFrom: undefined,
  yearTo: undefined,
  description: '',
};

/**
 * MotorcycleModelFormModal component
 *
 * Modal form for creating or editing a motorcycle model — the same shape as
 * CategoryFormModal, so the two management pages behave identically.
 */
export const MotorcycleModelFormModal: React.FC<MotorcycleModelFormModalProps> = ({
  isOpen,
  motorcycleModel,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!motorcycleModel;

  // Existing makes back a datalist on the make field. Free text is still
  // allowed — a new brand must be enterable — but suggesting what is already
  // there is what stops "Honda" and "HONDA" splitting into two makes in the
  // grouped picker.
  const { data: makes } = useMotorcycleMakes();

  const createMutation = useCreateMotorcycleModel();
  const updateMutation = useUpdateMotorcycleModel();

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MotorcycleModelFormData>({
    resolver: zodResolver(createMotorcycleModelSchema),
    defaultValues: emptyForm,
  });

  // Populate when editing, clear when switching to create
  useEffect(() => {
    if (motorcycleModel) {
      reset({
        make: motorcycleModel.make,
        model: motorcycleModel.model,
        yearFrom: motorcycleModel.yearFrom,
        yearTo: motorcycleModel.yearTo,
        description: motorcycleModel.description ?? '',
      });
    } else {
      reset(emptyForm);
    }
  }, [motorcycleModel, reset]);

  const onSubmit = async (data: MotorcycleModelFormData) => {
    try {
      if (isEditing && motorcycleModel) {
        // null, not undefined: JSON.stringify drops undefined keys, so a
        // cleared year would never reach the server and the old value would
        // survive the save. The controller reads null as "unset this".
        await updateMutation.mutateAsync({
          id: motorcycleModel._id,
          payload: {
            make: data.make,
            model: data.model,
            yearFrom: data.yearFrom ?? null,
            yearTo: data.yearTo ?? null,
            description: data.description ?? '',
          },
        });
      } else {
        await createMutation.mutateAsync({
          make: data.make,
          model: data.model,
          ...(data.yearFrom !== undefined && { yearFrom: data.yearFrom }),
          ...(data.yearTo !== undefined && { yearTo: data.yearTo }),
          ...(data.description && { description: data.description }),
        });
      }

      onSuccess?.();
      onClose();
    } catch {
      // Error is handled by mutation error state
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {isEditing ? 'Edit Motorcycle Model' : 'Create Motorcycle Model'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-6">
            {error && (
              <Alert variant="error" className="mb-6">
                {error.message}
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <Input
                  label="Make"
                  placeholder="e.g., Honda"
                  list="motorcycle-makes"
                  error={errors.make?.message}
                  {...register('make')}
                />
                <datalist id="motorcycle-makes">
                  {makes?.map((make) => (
                    <option key={make} value={make} />
                  ))}
                </datalist>
              </div>

              <Input
                label="Model"
                placeholder="e.g., Click 125i"
                error={errors.model?.message}
                {...register('model')}
              />
            </div>

            {/* Year range */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Year Range (Optional)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <Controller
                  name="yearFrom"
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="number"
                      placeholder="From (e.g., 2018)"
                      error={errors.yearFrom?.message}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : undefined)
                      }
                    />
                  )}
                />
                <Controller
                  name="yearTo"
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="number"
                      placeholder="To (e.g., 2023)"
                      error={errors.yearTo?.message}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : undefined)
                      }
                    />
                  )}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Leave both blank if the parts fit every year of this model.
              </p>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description (Optional)
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
                rows={3}
                placeholder="Notes about this motorcycle, e.g. variant or engine code..."
                {...register('description')}
              />
              {errors.description?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="sm" />
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </span>
                ) : isEditing ? (
                  'Update Motorcycle Model'
                ) : (
                  'Create Motorcycle Model'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MotorcycleModelFormModal;
