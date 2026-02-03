'use client';

import { useEffect, ComponentType } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

/**
 * Higher-order component that protects routes requiring authentication
 * 
 * Features:
 * - Redirects unauthenticated users to login
 * - Preserves intended destination for post-login redirect
 * - Shows loading state while checking auth
 * 
 * Usage:
 * export default withAuthGuard(DashboardPage);
 */
export function withAuthGuard<P extends object>(
  WrappedComponent: ComponentType<P>
): ComponentType<P> {
  const AuthGuardedComponent = (props: P) => {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, isLoading, isInitialized, initialize } = useAuthStore();

    // Initialize auth state on mount
    useEffect(() => {
      if (!isInitialized) {
        initialize();
      }
    }, [isInitialized, initialize]);

    // Redirect to login if not authenticated
    useEffect(() => {
      if (isInitialized && !isLoading && !isAuthenticated) {
        // Store intended destination
        const searchParams = new URLSearchParams();
        searchParams.set('redirect', pathname);
        router.push(`/login?${searchParams.toString()}`);
      }
    }, [isAuthenticated, isLoading, isInitialized, router, pathname]);

    // Show loading state while checking auth
    if (!isInitialized || isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4 animate-spin" />
            <p className="text-black">Loading...</p>
          </div>
        </div>
      );
    }

    // Don't render protected content if not authenticated
    if (!isAuthenticated) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };

  // Copy display name for better debugging
  AuthGuardedComponent.displayName = `withAuthGuard(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return AuthGuardedComponent;
}

export default withAuthGuard;
