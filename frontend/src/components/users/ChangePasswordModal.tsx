'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { changePasswordSchema, type ChangePasswordFormData } from '@/utils/validators/user';
import { useChangeUserPassword } from '@/hooks/useUsers';
import type { User } from '@/types/user';

interface ChangePasswordModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * ChangePasswordModal component
 * 
 * Modal form for admin to change a user's password
 */
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  user,
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Mutation
  const changePasswordMutation = useChangeUserPassword();

  const isSubmitting = changePasswordMutation.isPending;
  const error = changePasswordMutation.error;

  // Form setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      reset({
        newPassword: '',
        confirmPassword: '',
      });
      changePasswordMutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reset]);

  // Handle form submission
  const onSubmit = async (data: ChangePasswordFormData) => {
    if (!user) return;

    try {
      await changePasswordMutation.mutateAsync({
        id: user._id,
        payload: {
          newPassword: data.newPassword,
        },
      });

      onSuccess?.();
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-black">Change Password</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* User Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-medium ${
              user.isActive ? 'bg-yellow-500' : 'bg-gray-400'
            }`}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Error Alert */}
          {error && (
            <Alert variant="error" className="mb-4">
              {error.message}
            </Alert>
          )}

          {/* Success state handled by onSuccess */}

          <div className="space-y-4">
            <Input
              label="New Password"
              type="password"
              placeholder="Enter new password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Confirm new password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Password must be at least 6 characters and contain at least one uppercase letter, one lowercase letter, and one number.
          </p>

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
                  Changing...
                </span>
              ) : (
                'Change Password'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
