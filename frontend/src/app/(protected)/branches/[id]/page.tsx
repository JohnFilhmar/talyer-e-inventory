'use client';

import React, { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  useBranch,
  useBranchStats,
  useDeactivateBranch,
  useActivateBranch,
} from '@/hooks/useBranches';
import { BranchStatsGrid, BranchFormModal, DeactivateModal } from '@/components/branches';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

/**
 * Branch details page
 * 
 * Features:
 * - Display full branch information
 * - Show branch statistics (admin only)
 * - Edit and deactivate actions (admin only)
 */
export default function BranchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  const branchId = params.id as string;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  // Fetch branch details
  const { data: branch, isLoading, error, refetch } = useBranch(branchId);

  // Fetch branch stats (admin only)
  const { data: stats, isLoading: isLoadingStats } = useBranchStats(
    branchId,
    showAdminActions
  );

  // Mutations
  const deactivateMutation = useDeactivateBranch();
  const activateMutation = useActivateBranch();

  // Handlers
  const handleEdit = useCallback(() => {
    setShowFormModal(true);
  }, []);

  const handleDeactivate = useCallback(() => {
    setShowDeactivateModal(true);
  }, []);

  const handleConfirmDeactivate = useCallback(async () => {
    if (!branch) return;

    try {
      await deactivateMutation.mutateAsync(branch._id);
      setShowDeactivateModal(false);
      router.push('/branches');
    } catch {
      // Error handled by mutation state
    }
  }, [branch, deactivateMutation, router]);

  const handleActivate = useCallback(async () => {
    if (!branch) return;

    try {
      await activateMutation.mutateAsync(branch._id);
      refetch();
    } catch {
      // Error handled by mutation state
    }
  }, [branch, activateMutation, refetch]);

  const handleFormSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  // Check if user has access
  if (!user || (user.role !== 'admin' && user.role !== 'salesperson')) {
    return (
      <div className="text-center py-12">
        <Alert variant="error">
          You do not have permission to view this page.
        </Alert>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          Failed to load branch: {error.message}
        </Alert>
        <Link
          href="/branches"
          className="text-yellow-600 hover:text-yellow-700 font-medium"
        >
          ← Back to branches
        </Link>
      </div>
    );
  }

  // Not found
  if (!branch) {
    return (
      <div className="space-y-4">
        <Alert variant="error">Branch not found.</Alert>
        <Link
          href="/branches"
          className="text-yellow-600 hover:text-yellow-700 font-medium"
        >
          ← Back to branches
        </Link>
      </div>
    );
  }

  const managerName = typeof branch.manager === 'object' && branch.manager
    ? branch.manager.name
    : 'Not assigned';

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/branches"
        className="inline-flex items-center text-yellow-600 hover:text-yellow-700 font-medium"
      >
        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to branches
      </Link>

      {/* Mutation Errors */}
      {deactivateMutation.error && (
        <Alert variant="error">{deactivateMutation.error.message}</Alert>
      )}
      {activateMutation.error && (
        <Alert variant="error">{activateMutation.error.message}</Alert>
      )}

      {/* Branch Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-black">{branch.name}</h1>
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full ${
                  branch.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {branch.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded inline-block">
              {branch.code}
            </p>
          </div>

          {showAdminActions && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleEdit}>
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </span>
              </Button>
              {branch.isActive ? (
                <Button
                  variant="danger"
                  onClick={handleDeactivate}
                  disabled={deactivateMutation.isPending}
                >
                  {deactivateMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Deactivate
                    </span>
                  )}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleActivate}
                  disabled={activateMutation.isPending}
                >
                  {activateMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Activate
                    </span>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Branch Statistics (Admin only) */}
      {showAdminActions && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-black mb-4">Branch Statistics</h2>
          {isLoadingStats ? (
            <div className="flex justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : stats ? (
            <BranchStatsGrid stats={stats} />
          ) : (
            <p className="text-gray-500 text-center py-4">
              No statistics available.
            </p>
          )}
        </div>
      )}

      {/* Branch Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Address Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-black mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Address
          </h2>
          {branch.address ? (
            <div className="space-y-2 text-gray-700">
              <p>{branch.address.street}</p>
              <p>
                {branch.address.city}, {branch.address.province} {branch.address.postalCode}
              </p>
              <p>{branch.address.country}</p>
            </div>
          ) : (
            <p className="text-gray-500">No address information</p>
          )}
        </div>

        {/* Contact Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-black mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Contact
          </h2>
          {branch.contact ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <a href={`tel:${branch.contact.phone}`} className="hover:text-yellow-600">
                  {branch.contact.phone}
                </a>
              </div>
              {branch.contact.email && (
                <div className="flex items-center gap-2 text-gray-700">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href={`mailto:${branch.contact.email}`} className="hover:text-yellow-600">
                    {branch.contact.email}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">No contact information</p>
          )}
        </div>

        {/* Manager Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-black mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Manager
          </h2>
          <p className="text-gray-700">{managerName}</p>
          {typeof branch.manager === 'object' && branch.manager?.email && (
            <p className="text-sm text-gray-500 mt-1">{branch.manager.email}</p>
          )}
        </div>

        {/* Settings Card (Admin only) */}
        {showAdminActions && branch.settings && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-black mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Currency</span>
                <span className="font-medium text-gray-900">
                  {branch.settings.currency ?? 'MXN'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Timezone</span>
                <span className="font-medium text-gray-900">
                  {branch.settings.timezone ?? 'America/Mexico_City'}
                </span>
              </div>
              {typeof branch.settings.lowStockThreshold === 'number' && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Low Stock Threshold</span>
                  <span className="font-medium text-gray-900">
                    {branch.settings.lowStockThreshold}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Metadata (Admin only) */}
      {showAdminActions && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <span>
              Created: {new Date(branch.createdAt).toLocaleDateString()}
            </span>
            <span>
              Last updated: {new Date(branch.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {/* Branch Form Modal */}
      <BranchFormModal
        isOpen={showFormModal}
        branch={branch}
        onClose={() => setShowFormModal(false)}
        onSuccess={handleFormSuccess}
      />

      {/* Deactivate Confirmation Modal */}
      <DeactivateModal
        isOpen={showDeactivateModal}
        branchName={branch.name}
        isLoading={deactivateMutation.isPending}
        onClose={() => setShowDeactivateModal(false)}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}
