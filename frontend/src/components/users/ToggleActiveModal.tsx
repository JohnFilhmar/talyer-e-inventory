'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { User } from '@/types/user';

interface ToggleActiveModalProps {
  user: User | null;
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * ToggleActiveModal component
 * 
 * Confirmation modal for activating or deactivating a user
 */
export const ToggleActiveModal: React.FC<ToggleActiveModalProps> = ({
  user,
  isOpen,
  isLoading,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !user) return null;

  const isDeactivating = user.isActive;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isDeactivating ? 'bg-red-100' : 'bg-green-100'
          }`}>
            {isDeactivating ? (
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
            ) : (
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-black text-center mb-2">
          {isDeactivating ? 'Deactivate User?' : 'Activate User?'}
        </h3>

        {/* Message */}
        <p className="text-gray-600 text-center mb-6">
          {isDeactivating ? (
            <>
              This will prevent{' '}
              <span className="font-semibold">{user.name}</span> from logging in
              and accessing the system. They can be reactivated later.
            </>
          ) : (
            <>
              This will allow{' '}
              <span className="font-semibold">{user.name}</span> to log in and
              access the system again.
            </>
          )}
        </p>

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

        {/* Actions */}
        <div className="flex justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isDeactivating
                ? 'text-red-600 bg-red-50 border border-red-200 hover:bg-red-100'
                : 'text-green-600 bg-green-50 border border-green-200 hover:bg-green-100'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                {isDeactivating ? 'Deactivating...' : 'Activating...'}
              </span>
            ) : (
              isDeactivating ? 'Deactivate' : 'Activate'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ToggleActiveModal;
