'use client';

import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
  createUserSchema,
  updateUserSchema,
  roleRequiresBranch,
  type CreateUserFormData,
  type UpdateUserFormData,
} from '@/utils/validators/user';
import { useBranches } from '@/hooks/useBranches';
import { useCreateUser, useUpdateUser } from '@/hooks/useUsers';
import type { User, UserRole } from '@/types/user';

interface UserFormModalProps {
  isOpen: boolean;
  user?: User | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'customer', label: 'Customer' },
];

/**
 * UserFormModal component
 * 
 * Modal form for creating or editing a user
 */
export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  user,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!user;

  // Fetch active branches for dropdown
  const { data: branchesData, isLoading: branchesLoading } = useBranches({ limit: 100, active: 'true' });
  const branches = branchesData?.data ?? [];

  // Mutations
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  // Use appropriate schema based on mode
  const schema = useMemo(() => isEditing ? updateUserSchema : createUserSchema, [isEditing]);

  // Form setup
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormData | UpdateUserFormData>({
    resolver: zodResolver(schema),
    defaultValues: isEditing ? {
      name: '',
      email: '',
      role: 'salesperson' as const,
      branch: '',
    } : {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'salesperson' as const,
      branch: '',
    },
  });

  // Watch role to conditionally require branch
  const selectedRole = watch('role');
  const showBranchField = roleRequiresBranch(selectedRole as UserRole);

  // Populate form when editing or reset when creating
  useEffect(() => {
    if (isEditing && user) {
      reset({
        name: user.name,
        email: user.email,
        role: user.role,
        branch: user.branch?._id ?? '',
      });
    } else if (!isEditing && isOpen) {
      reset({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'salesperson' as const,
        branch: '',
      });
    }
  }, [user, isEditing, isOpen, reset]);

  // Reset mutations when modal closes
  useEffect(() => {
    if (!isOpen) {
      createMutation.reset();
      updateMutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Handle form submission
  const onSubmit = async (data: CreateUserFormData | UpdateUserFormData) => {
    try {
      if (isEditing && user) {
        // Update user
        const updateData = data as UpdateUserFormData;
        await updateMutation.mutateAsync({
          id: user._id,
          payload: {
            name: updateData.name,
            email: updateData.email,
            role: updateData.role,
            // Only include branch if role requires it, otherwise null to clear
            branch: roleRequiresBranch(updateData.role)
              ? updateData.branch || undefined
              : null,
          },
        });
      } else {
        // Create user
        const createData = data as CreateUserFormData;
        await createMutation.mutateAsync({
          name: createData.name,
          email: createData.email,
          password: createData.password,
          role: createData.role,
          branch: roleRequiresBranch(createData.role) ? createData.branch : undefined,
        });
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
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-black">
            {isEditing ? 'Edit User' : 'Add User'}
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

          {/* User Info */}
          <div className="space-y-4">
            <Input
              label="Full Name"
              placeholder="e.g., John Doe"
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="e.g., john@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            {/* Password fields only for create mode */}
            {!isEditing && (
              <>
                <Input
                  label="Password"
                  type="password"
                  placeholder="Enter password"
                  error={(errors as { password?: { message?: string } }).password?.message}
                  {...register('password' as keyof (CreateUserFormData | UpdateUserFormData))}
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Confirm password"
                  error={(errors as { confirmPassword?: { message?: string } }).confirmPassword?.message}
                  {...register('confirmPassword' as keyof (CreateUserFormData | UpdateUserFormData))}
                />
              </>
            )}

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                {...register('role')}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.role?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
              )}
            </div>

            {/* Branch Selection - only shown for roles that require it */}
            {showBranchField && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch <span className="text-red-500">*</span>
                </label>
                {branchesLoading ? (
                  <div className="flex items-center gap-2 p-2">
                    <Spinner size="sm" />
                    <span className="text-sm text-gray-500">Loading branches...</span>
                  </div>
                ) : (
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    {...register('branch')}
                  >
                    <option value="">Select a branch</option>
                    {branches.map((branch) => (
                      <option key={branch._id} value={branch._id}>
                        {branch.name} ({branch.code})
                      </option>
                    ))}
                  </select>
                )}
                {errors.branch?.message && (
                  <p className="mt-1 text-sm text-red-600">{errors.branch.message}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {selectedRole === 'salesperson' ? 'Salespersons' : 'Mechanics'} must be assigned to a branch.
                </p>
              </div>
            )}
          </div>

          {/* Editing Note */}
          {isEditing && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> To change this user&apos;s password, use the &quot;Change Password&quot; option from the user list.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200">
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
                isEditing ? 'Update User' : 'Create User'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserFormModal;
