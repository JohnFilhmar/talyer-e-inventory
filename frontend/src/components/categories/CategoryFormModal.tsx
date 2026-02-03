'use client';

import React, { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { createCategorySchema } from '@/utils/validators/category';
import { useCreateCategory, useUpdateCategory, useFlattenedCategories } from '@/hooks/useCategories';
import { CATEGORY_COLORS, type CategoryColor } from '@/types/category';
import type { Category } from '@/types/category';

/**
 * Form data type for category form
 * Explicit type to avoid Zod inference issues with nullable transform
 */
interface CategoryFormData {
  name: string;
  code?: string;
  description?: string;
  parent?: string | null;
  image?: string;
  color?: CategoryColor | '';
  sortOrder?: number;
}

interface CategoryFormModalProps {
  isOpen: boolean;
  category?: Category | null;
  parentCategory?: Category | null;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * CategoryFormModal component
 * 
 * Modal form for creating or editing a category
 */
export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  category,
  parentCategory,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!category;

  // Fetch categories for parent dropdown
  const { data: flattenedCategories, isLoading: categoriesLoading } = useFlattenedCategories();

  // Mutations
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  // Form setup
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      parent: parentCategory?._id ?? null,
      image: '',
      color: '',
      sortOrder: 0,
    },
  });

  const selectedColor = useWatch({ control, name: 'color' });

  // Auto-uppercase the code field on change
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uppercased = e.target.value.toUpperCase();
    setValue('code', uppercased);
  };

  // Populate form when editing
  useEffect(() => {
    if (category) {
      const parentId = typeof category.parent === 'object' 
        ? category.parent?._id 
        : category.parent;
      
      reset({
        name: category.name,
        code: category.code,
        description: category.description ?? '',
        parent: parentId ?? null,
        image: category.image ?? '',
        color: (category.color ?? '') as CategoryColor | '',
        sortOrder: category.sortOrder ?? 0,
      });
    } else {
      reset({
        name: '',
        code: '',
        description: '',
        parent: parentCategory?._id ?? null,
        image: '',
        color: '',
        sortOrder: 0,
      });
    }
  }, [category, parentCategory, reset]);

  // Handle form submission
  const onSubmit = async (data: CategoryFormData) => {
    try {
      // Clean up empty optional fields
      const payload = {
        name: data.name,
        ...(data.code && { code: data.code }),
        ...(data.description && { description: data.description }),
        parent: data.parent ?? null,
        ...(data.image && { image: data.image }),
        ...(data.color && { color: data.color }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      };

      if (isEditing && category) {
        await updateMutation.mutateAsync({
          id: category._id,
          payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }

      onSuccess?.();
      onClose();
    } catch {
      // Error is handled by mutation error state
    }
  };

  // Filter out current category and its children from parent options (for editing)
  const getAvailableParents = () => {
    if (!flattenedCategories) return [];
    
    if (!isEditing || !category) {
      return flattenedCategories;
    }

    // Exclude the category being edited and its descendants
    const excludeIds = new Set<string>([category._id]);
    
    const collectChildIds = (cats: Category[]) => {
      for (const cat of cats) {
        if (cat.children) {
          for (const child of cat.children) {
            excludeIds.add(child._id);
            if (child.children) {
              collectChildIds(child.children);
            }
          }
        }
      }
    };
    
    if (category.children) {
      collectChildIds([category]);
    }

    return flattenedCategories.filter(cat => !excludeIds.has(cat._id));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {isEditing ? 'Edit Category' : 'Create Category'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-6">
            {/* Error Alert */}
            {error && (
              <Alert variant="error" className="mb-6">
                {error.message}
              </Alert>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Input
                label="Category Name"
                placeholder="e.g., Electronics"
                error={errors.name?.message}
                {...register('name')}
              />
              <Input
                label="Category Code (Optional)"
                placeholder="e.g., ELEC-001"
                error={errors.code?.message}
                {...register('code')}
                onChange={handleCodeChange}
              />
            </div>

            {/* Parent Category */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Parent Category (Optional)
              </label>
              {categoriesLoading ? (
                <div className="flex items-center gap-2 p-2">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-500">Loading categories...</span>
                </div>
              ) : (
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  {...register('parent')}
                >
                  <option value="">No parent (Root category)</option>
                  {getAvailableParents().map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {'— '.repeat(cat.level)}{cat.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.parent?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.parent.message}</p>
              )}
            </div>

            {/* Color Picker */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Category Color (Optional)
              </label>
              <div className="grid grid-cols-9 gap-2">
                {/* Clear option */}
                <button
                  type="button"
                  onClick={() => setValue('color', '')}
                  className={`
                    w-8 h-8 rounded-lg border-2 flex items-center justify-center
                    bg-white dark:bg-gray-800
                    ${!selectedColor ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'}
                    hover:border-gray-500 transition-colors
                  `}
                  title="No color"
                >
                  {!selectedColor && (
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
                
                {/* Color options */}
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setValue('color', color.value)}
                    className={`
                      w-8 h-8 rounded-lg border-2 transition-all
                      ${selectedColor === color.value 
                        ? 'border-gray-900 dark:border-white scale-110' 
                        : 'border-transparent hover:scale-105'}
                    `}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
              {errors.color?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.color.message}</p>
              )}
            </div>

            {/* Sort Order */}
            <div className="mb-6">
              <Input
                type="number"
                label="Sort Order (Optional)"
                placeholder="0"
                error={errors.sortOrder?.message}
                {...register('sortOrder', { valueAsNumber: true })}
              />
              <p className="mt-1 text-xs text-gray-500">
                Lower numbers appear first
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
                placeholder="Brief description of the category..."
                {...register('description')}
              />
              {errors.description?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            {/* Image URL */}
            <div className="mb-6">
              <Input
                label="Image URL (Optional)"
                placeholder="https://example.com/image.jpg"
                error={errors.image?.message}
                {...register('image')}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="sm" />
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </span>
                ) : (
                  isEditing ? 'Update Category' : 'Create Category'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CategoryFormModal;
