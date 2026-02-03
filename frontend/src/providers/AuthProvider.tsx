'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

/**
 * AuthProvider component
 * 
 * Initializes authentication state on app load.
 * Wraps the entire application to ensure auth state is available everywhere.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { initialize, isInitialized } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  return <>{children}</>;
};

export default AuthProvider;
