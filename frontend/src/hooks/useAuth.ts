import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { listOutbox } from '@/lib/offline/outbox';
import type { UserRole } from '@/types/auth';
import { resolveBranchId } from '@/types/auth';

/**
 * Custom hook for authentication operations and state
 */
export const useAuth = () => {
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,
    login,
    registerCustomer,
    logout,
    initialize,
    clearError,
  } = useAuthStore();

  /**
   * Initialize auth state on mount
   */
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  /**
   * Login and redirect to dashboard on success
   */
  const handleLogin = useCallback(
    async (email: string, password: string, redirectTo?: string) => {
      const success = await login(email, password);
      if (success) {
        router.push(redirectTo || '/dashboard');
      }
      return success;
    },
    [login, router]
  );

  /**
   * Register customer and redirect to dashboard on success
   */
  const handleRegister = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      redirectTo?: string
    ) => {
      const success = await registerCustomer(name, email, password);
      if (success) {
        router.push(redirectTo || '/dashboard');
      }
      return success;
    },
    [registerCustomer, router]
  );

  /**
   * Logout and redirect to login page
   */
  const handleLogout = useCallback(async () => {
    // Logout clears the outbox, and outbox rows are unsent sales and service
    // orders that cannot be refetched. Warn before destroying them rather than
    // trading a cross-user data leak for silent data loss.
    //
    // Every row counts, not just the unsent ones. `rejected` entries are the
    // sales the server refused, and they are precisely the ones waiting on a
    // human at /sync to void, backorder or re-price. Losing those silently is
    // worse than losing a retryable one, so `countPendingOutbox` is not the
    // right measure here: it excludes them by design.
    //
    // A failure to read the queue must not block logout. Signing out is the
    // security-relevant action and has to win.
    let queued: { unsent: number; rejected: number } = { unsent: 0, rejected: 0 };
    try {
      const rows = await listOutbox();
      queued = {
        unsent: rows.filter((entry) => entry.status !== 'rejected').length,
        rejected: rows.filter((entry) => entry.status === 'rejected').length,
      };
    } catch {
      // Keep the zeroed default. Signing out is the security-relevant
      // action and has to win, so a failure to read the queue is not an
      // error here. Reassigning the same value it already holds is what
      // made the initialiser read as dead code.
    }

    const total = queued.unsent + queued.rejected;
    if (total > 0) {
      const parts: string[] = [];
      if (queued.unsent > 0) {
        parts.push(`${queued.unsent} not yet synced`);
      }
      if (queued.rejected > 0) {
        parts.push(`${queued.rejected} rejected and still needing attention`);
      }
      const noun = total === 1 ? 'order' : 'orders';
      const proceed = window.confirm(
        `You have ${total} queued ${noun} (${parts.join(', ')}). ` +
          `Signing out discards them permanently and they cannot be recovered.\n\n` +
          `Reconnect and let the queue drain, or resolve them at /sync, to keep them.\n\n` +
          `Sign out anyway?`
      );
      if (!proceed) return;
    }

    await logout();
    router.push('/login');
  }, [logout, router]);

  /**
   * Check if user has a specific role
   */
  const hasRole = useCallback(
    (roles: UserRole | UserRole[]): boolean => {
      if (!user) return false;
      const roleArray = Array.isArray(roles) ? roles : [roles];
      return roleArray.includes(user.role);
    },
    [user]
  );

  /**
   * Check if user is admin
   */
  const isAdmin = useCallback((): boolean => {
    return hasRole('admin');
  }, [hasRole]);

  /**
   * Check if user has access to a specific branch
   */
  const hasBranchAccess = useCallback(
    (branchId: string): boolean => {
      if (!user) return false;
      // Admins have access to all branches
      if (user.role === 'admin') return true;
      // Other users only have access to their assigned branch
      return resolveBranchId(user.branch) === branchId;
    },
    [user]
  );

  return {
    // State
    user,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,

    // Actions
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    clearError,

    // Role helpers
    hasRole,
    isAdmin,
    hasBranchAccess,
  };
};
