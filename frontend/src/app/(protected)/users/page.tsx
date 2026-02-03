'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useUsers,
  useDeactivateUser,
  useActivateUser,
} from '@/hooks/useUsers';
import {
  UserFormModal,
  UserTable,
  ToggleActiveModal,
  ChangePasswordModal,
} from '@/components/users';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import type { User, UserListParams, UserRole } from '@/types/user';

type FilterStatus = 'all' | 'active' | 'inactive';
type FilterRole = 'all' | UserRole;

/**
 * Users management page
 * 
 * Features:
 * - List all users with search and filters
 * - Admin can create, edit, activate/deactivate users
 * - Admin can change user passwords
 * - Role-based access (admin only)
 */
export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth();

  // Filter state
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [page, setPage] = useState(1);

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [toggleActiveUser, setToggleActiveUser] = useState<User | null>(null);
  const [changePasswordUser, setChangePasswordUser] = useState<User | null>(null);

  // Build query params
  const queryParams: UserListParams = {
    search: search || undefined,
    isActive: filterStatus === 'all' ? undefined : filterStatus === 'active',
    role: filterRole === 'all' ? undefined : filterRole,
    page,
    limit: 10,
  };

  // Fetch users
  const { data, isLoading, error, refetch } = useUsers(queryParams);
  const users = data?.users ?? [];
  const pagination = data?.pagination;

  // Mutations
  const deactivateMutation = useDeactivateUser();
  const activateMutation = useActivateUser();

  // Handlers
  const handleAddUser = useCallback(() => {
    setEditingUser(null);
    setShowFormModal(true);
  }, []);

  const handleEditUser = useCallback((user: User) => {
    setEditingUser(user);
    setShowFormModal(true);
  }, []);

  const handleToggleActive = useCallback((user: User) => {
    setToggleActiveUser(user);
  }, []);

  const handleChangePassword = useCallback((user: User) => {
    setChangePasswordUser(user);
  }, []);

  const handleConfirmToggle = useCallback(async () => {
    if (!toggleActiveUser) return;

    try {
      if (toggleActiveUser.isActive) {
        await deactivateMutation.mutateAsync(toggleActiveUser._id);
      } else {
        await activateMutation.mutateAsync(toggleActiveUser._id);
      }
      setToggleActiveUser(null);
    } catch {
      // Error handled by mutation state
    }
  }, [toggleActiveUser, deactivateMutation, activateMutation]);

  const handleFormSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handlePasswordSuccess = useCallback(() => {
    // Optionally show a toast notification
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((status: FilterStatus) => {
    setFilterStatus(status);
    setPage(1);
  }, []);

  const handleRoleFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterRole(e.target.value as FilterRole);
    setPage(1);
  }, []);

  // Check if user has access (admin only)
  if (!currentUser || !isAdmin()) {
    return (
      <div className="text-center py-12">
        <Alert variant="error">
          You do not have permission to view this page.
        </Alert>
      </div>
    );
  }

  const isToggleLoading = deactivateMutation.isPending || activateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Users</h1>
          <p className="text-gray-600">Manage user accounts and permissions</p>
        </div>
        <Button variant="primary" onClick={handleAddUser}>
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </span>
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Role Filter */}
        <div>
          <select
            value={filterRole}
            onChange={handleRoleFilterChange}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white"
          >
            <option value="all">All Roles</option>
            <option value="admin">Administrator</option>
            <option value="salesperson">Salesperson</option>
            <option value="mechanic">Mechanic</option>
            <option value="customer">Customer</option>
          </select>
        </div>

        {/* Status Filter Chips */}
        <div className="flex gap-2">
          <button
            onClick={() => handleStatusFilterChange('all')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filterStatus === 'all'
                ? 'bg-yellow-400 text-black'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleStatusFilterChange('active')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filterStatus === 'active'
                ? 'bg-yellow-400 text-black'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => handleStatusFilterChange('inactive')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filterStatus === 'inactive'
                ? 'bg-yellow-400 text-black'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="error">
          Failed to load users: {error.message}
        </Alert>
      )}

      {/* Toggle Active Error */}
      {(deactivateMutation.error || activateMutation.error) && (
        <Alert variant="error">
          {deactivateMutation.error?.message || activateMutation.error?.message}
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Users Table */}
      {!isLoading && (
        <UserTable
          users={users}
          currentUserId={currentUser._id}
          onEdit={handleEditUser}
          onToggleActive={handleToggleActive}
          onChangePassword={handleChangePassword}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-700">
            Page {page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* User Form Modal */}
      <UserFormModal
        isOpen={showFormModal}
        user={editingUser}
        onClose={() => {
          setShowFormModal(false);
          setEditingUser(null);
        }}
        onSuccess={handleFormSuccess}
      />

      {/* Toggle Active Confirmation Modal */}
      <ToggleActiveModal
        isOpen={!!toggleActiveUser}
        user={toggleActiveUser}
        isLoading={isToggleLoading}
        onClose={() => setToggleActiveUser(null)}
        onConfirm={handleConfirmToggle}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={!!changePasswordUser}
        user={changePasswordUser}
        onClose={() => setChangePasswordUser(null)}
        onSuccess={handlePasswordSuccess}
      />
    </div>
  );
}
