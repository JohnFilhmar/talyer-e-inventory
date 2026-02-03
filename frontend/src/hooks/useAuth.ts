import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types/auth';

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
      return user.branch === branchId;
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
