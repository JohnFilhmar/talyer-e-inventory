'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useBranch } from '@/hooks/useBranches';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '@/types/branch';

/**
 * Branch context value interface
 */
interface BranchContextValue {
  /** The current user's assigned branch (null for admins or loading state) */
  currentBranch: Branch | null;
  /** Whether the branch is currently loading */
  isLoading: boolean;
  /** Error if branch fetch failed */
  error: Error | null;
  /** Whether the user has a branch assigned */
  hasBranch: boolean;
  /** The branch ID (from user profile) */
  branchId: string | null;
  /** Refetch the branch data */
  refetch: () => void;
}

/**
 * Default context value
 */
const defaultContextValue: BranchContextValue = {
  currentBranch: null,
  isLoading: false,
  error: null,
  hasBranch: false,
  branchId: null,
  refetch: () => {},
};

/**
 * Branch context
 */
const BranchContext = createContext<BranchContextValue>(defaultContextValue);

/**
 * BranchProvider component
 * 
 * Provides the current user's branch context to all child components.
 * For non-admin users, this fetches and provides their assigned branch.
 * Admin users don't have an assigned branch and can access all branches.
 * 
 * Usage:
 * - Wrap protected routes with this provider
 * - Use useBranchContext() hook to access the current branch
 */
export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuthStore();
  
  // Get the branch ID from the user's profile
  const branchId = user?.branch ?? null;
  
  // Fetch branch details if user has a branch assigned
  const {
    data: currentBranch,
    isLoading,
    error,
    refetch,
  } = useBranch(branchId ?? undefined);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<BranchContextValue>(
    () => ({
      currentBranch: currentBranch ?? null,
      isLoading: isAuthenticated && !!branchId && isLoading,
      error: error ?? null,
      hasBranch: !!branchId,
      branchId,
      refetch,
    }),
    [currentBranch, isLoading, error, branchId, isAuthenticated, refetch]
  );

  return (
    <BranchContext.Provider value={contextValue}>
      {children}
    </BranchContext.Provider>
  );
};

/**
 * Hook to access the branch context
 * 
 * @returns BranchContextValue with current branch info
 * @throws Error if used outside of BranchProvider
 */
export const useBranchContext = (): BranchContextValue => {
  const context = useContext(BranchContext);
  
  if (context === undefined) {
    throw new Error('useBranchContext must be used within a BranchProvider');
  }
  
  return context;
};

export default BranchProvider;
