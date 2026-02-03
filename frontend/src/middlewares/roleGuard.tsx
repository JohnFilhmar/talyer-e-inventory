'use client';

import { useEffect, ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types/auth';

/**
 * Configuration for role guard
 */
interface RoleGuardOptions {
  /** Allowed roles for the protected route */
  allowedRoles: UserRole[];
  /** Redirect path when user doesn't have required role (default: /dashboard) */
  redirectTo?: string;
  /** Optional branch ID to check access */
  branchId?: string;
}

/**
 * Higher-order component that protects routes based on user roles
 * 
 * Features:
 * - Restricts access to users with specific roles
 * - Supports multiple allowed roles
 * - Optional branch-based access control
 * - Redirects unauthorized users
 * 
 * Usage:
 * export default withRoleGuard(AdminPage, { allowedRoles: ['admin'] });
 * export default withRoleGuard(BranchPage, { allowedRoles: ['admin', 'salesperson'], branchId: 'branch123' });
 */
export function withRoleGuard<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: RoleGuardOptions
): ComponentType<P> {
  const { allowedRoles, redirectTo = '/dashboard', branchId } = options;

  const RoleGuardedComponent = (props: P) => {
    const router = useRouter();
    const { user, isAuthenticated, isLoading, isInitialized, initialize } = useAuthStore();

    // Initialize auth state on mount
    useEffect(() => {
      if (!isInitialized) {
        initialize();
      }
    }, [isInitialized, initialize]);

    // Check access and redirect if unauthorized
    useEffect(() => {
      if (isInitialized && !isLoading) {
        // Not authenticated - let authGuard handle redirect to login
        if (!isAuthenticated || !user) {
          router.push('/login');
          return;
        }

        // Check role access
        const hasRoleAccess = allowedRoles.includes(user.role);
        
        // Check branch access (admins have access to all branches)
        let hasBranchAccess = true;
        if (branchId && user.role !== 'admin') {
          hasBranchAccess = user.branch === branchId;
        }

        // Redirect if no access
        if (!hasRoleAccess || !hasBranchAccess) {
          router.push(redirectTo);
        }
      }
    }, [isAuthenticated, isLoading, isInitialized, user, router]);

    // Show loading state while checking auth
    if (!isInitialized || isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-black">Loading...</p>
          </div>
          <style jsx>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      );
    }

    // Don't render if not authenticated
    if (!isAuthenticated || !user) {
      return null;
    }

    // Don't render if no role access
    if (!allowedRoles.includes(user.role)) {
      return null;
    }

    // Don't render if no branch access
    if (branchId && user.role !== 'admin' && user.branch !== branchId) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };

  // Copy display name for better debugging
  RoleGuardedComponent.displayName = `withRoleGuard(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return RoleGuardedComponent;
}

export default withRoleGuard;
