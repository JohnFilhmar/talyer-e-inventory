'use client';

import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { initOutboxSync } from '@/lib/offline/sync';

/**
 * AuthProvider component
 *
 * Initializes authentication state on app load.
 * Wraps the entire application to ensure auth state is available everywhere.
 *
 * Also wires up the offline outbox's replay trigger (Task 6 Step 3): once
 * on mount if the browser is already online, and again on every `online`
 * event. This lives here — not in a new provider or in the create-mutation
 * hooks — because AuthProvider already sits inside QueryProvider and
 * mounts exactly once for the whole app, the same "run this one thing on
 * load" role it already plays for `initialize()`. No UI is added; the
 * review-queue page and offline banner that surface outbox state are
 * Task 7's job.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { initialize, isInitialized } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  useEffect(() => initOutboxSync(queryClient), [queryClient]);

  return <>{children}</>;
};

export default AuthProvider;
