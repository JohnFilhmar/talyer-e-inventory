'use client';

import React from 'react';
import Link from 'next/link';
import type { Branch, BranchManager } from '@/types/branch';
import { useAuth } from '@/hooks/useAuth';

interface BranchCardProps {
  branch: Branch;
  onEdit?: (branch: Branch) => void;
  onDeactivate?: (branch: Branch) => void;
}

/**
 * Check if manager is a populated object or just an ID string
 */
function isPopulatedManager(manager: BranchManager | string | undefined): manager is BranchManager {
  return manager !== undefined && typeof manager === 'object' && '_id' in manager;
}

/**
 * BranchCard component
 * 
 * Displays branch information in a card format
 * with action buttons for admin users
 */
export const BranchCard: React.FC<BranchCardProps> = ({
  branch,
  onEdit,
  onDeactivate,
}) => {
  const { isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
      {/* Header with name and status */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-black truncate">{branch.name}</h3>
          <p className="text-sm text-gray-500">{branch.code}</p>
        </div>
        
        {/* Status badge */}
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            branch.isActive
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {branch.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Address */}
      <div className="mb-3">
        <p className="text-sm text-gray-600 truncate">
          {branch.address.city}, {branch.address.province}
        </p>
      </div>

      {/* Contact info */}
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="truncate">{branch.contact.phone}</span>
        </div>
        {branch.contact.email && (
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="truncate">{branch.contact.email}</span>
          </div>
        )}
      </div>

      {/* Manager info */}
      {isPopulatedManager(branch.manager) && (
        <div className="mb-4 text-sm">
          <span className="text-gray-500">Manager: </span>
          <span className="text-gray-700">{branch.manager.name}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <Link
          href={`/branches/${branch._id}`}
          className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
        >
          View Details
        </Link>

        {showAdminActions && (
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(branch)}
                className="p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-md transition-colors"
                title="Edit branch"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {onDeactivate && branch.isActive && (
              <button
                onClick={() => onDeactivate(branch)}
                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title="Deactivate branch"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchCard;
