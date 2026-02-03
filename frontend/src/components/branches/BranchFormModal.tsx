'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { createBranchSchema, type CreateBranchFormData } from '@/utils/validators/branch';
import { useManagers, useCreateBranch, useUpdateBranch } from '@/hooks/useBranches';
import type { Branch } from '@/types/branch';

interface BranchFormModalProps {
  isOpen: boolean;
  branch?: Branch | null;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * BranchFormModal component
 * 
 * Modal form for creating or editing a branch
 */
export const BranchFormModal: React.FC<BranchFormModalProps> = ({
  isOpen,
  branch,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!branch;

  // Fetch managers for dropdown
  const { data: managers, isLoading: managersLoading } = useManagers();

  // Mutations
  const createMutation = useCreateBranch();
  const updateMutation = useUpdateBranch();

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  // Form setup
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateBranchFormData>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: {
      name: '',
      code: '',
      address: {
        street: '',
        city: '',
        province: '',
        postalCode: '',
      },
      contact: {
        phone: '',
        email: '',
      },
      manager: '',
      description: '',
    },
  });

  // Auto-uppercase the code field on change
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uppercased = e.target.value.toUpperCase();
    setValue('code', uppercased);
  };

  // Populate form when editing
  useEffect(() => {
    if (branch) {
      reset({
        name: branch.name,
        code: branch.code,
        address: {
          street: branch.address.street,
          city: branch.address.city,
          province: branch.address.province,
          postalCode: branch.address.postalCode ?? '',
        },
        contact: {
          phone: branch.contact.phone,
          email: branch.contact.email ?? '',
        },
        manager: typeof branch.manager === 'object' ? branch.manager._id : branch.manager ?? '',
        description: branch.description ?? '',
      });
    } else {
      reset({
        name: '',
        code: '',
        address: {
          street: '',
          city: '',
          province: '',
          postalCode: '',
        },
        contact: {
          phone: '',
          email: '',
        },
        manager: '',
        description: '',
      });
    }
  }, [branch, reset]);

  // Handle form submission
  const onSubmit = async (data: CreateBranchFormData) => {
    try {
      // Clean up empty optional fields
      const payload = {
        ...data,
        manager: data.manager || undefined,
        description: data.description || undefined,
        address: {
          ...data.address,
          postalCode: data.address.postalCode || undefined,
        },
        contact: {
          ...data.contact,
          email: data.contact.email || undefined,
        },
      };

      if (isEditing && branch) {
        await updateMutation.mutateAsync({
          id: branch._id,
          payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }

      onSuccess?.();
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-black">
            {isEditing ? 'Edit Branch' : 'Add Branch'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              label="Branch Name"
              placeholder="e.g., Main Branch"
              error={errors.name?.message}
              {...register('name')}
            />
            <Input
              label="Branch Code"
              placeholder="e.g., MAIN-001"
              error={errors.code?.message}
              {...register('code')}
              onChange={handleCodeChange}
            />
          </div>

          {/* Contact Info */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Input
              label="Phone"
              placeholder="e.g., +63 2 1234 5678"
              error={errors.contact?.phone?.message}
              {...register('contact.phone')}
            />
            <Input
              label="Email (Optional)"
              type="email"
              placeholder="e.g., branch@company.com"
              error={errors.contact?.email?.message}
              {...register('contact.email')}
            />
          </div>

          {/* Address */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Address</h3>
          <div className="grid grid-cols-1 gap-4 mb-4">
            <Input
              label="Street Address"
              placeholder="e.g., 123 Main Street"
              error={errors.address?.street?.message}
              {...register('address.street')}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Input
              label="City"
              placeholder="e.g., Manila"
              error={errors.address?.city?.message}
              {...register('address.city')}
            />
            <Input
              label="Province"
              placeholder="e.g., Metro Manila"
              error={errors.address?.province?.message}
              {...register('address.province')}
            />
            <Input
              label="Postal Code (Optional)"
              placeholder="e.g., 1000"
              error={errors.address?.postalCode?.message}
              {...register('address.postalCode')}
            />
          </div>

          {/* Manager */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Management</h3>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Branch Manager (Optional)
            </label>
            {managersLoading ? (
              <div className="flex items-center gap-2 p-2">
                <Spinner size="sm" />
                <span className="text-sm text-gray-500">Loading managers...</span>
              </div>
            ) : (
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                {...register('manager')}
              >
                <option value="">Select a manager</option>
                {managers?.map((manager) => (
                  <option key={manager._id} value={manager._id}>
                    {manager.name} ({manager.email}) - {manager.role}
                  </option>
                ))}
              </select>
            )}
            {errors.manager?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.manager.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
              rows={3}
              placeholder="Brief description of the branch..."
              {...register('description')}
            />
            {errors.description?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
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
                isEditing ? 'Update Branch' : 'Create Branch'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BranchFormModal;
