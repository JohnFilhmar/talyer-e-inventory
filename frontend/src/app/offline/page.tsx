'use client';

import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Offline fallback page.
 *
 * Served by the service worker (see `src/app/sw.ts`) in place of any
 * document navigation the network cannot fulfil. It is precached at build
 * time, so it must render without any network dependency of its own — no
 * data fetching, no auth check, nothing that could itself fail offline.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-7xl flex justify-center">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-md bg-yellow-400">
            <WifiOff className="h-8 w-8 text-black" aria-hidden="true" />
          </div>

          <h1 className="text-2xl font-bold text-black mb-2">
            You&apos;re offline
          </h1>

          <p className="text-gray-500 mb-6">
            This page needs a connection to load. Anything you already
            entered is safe — queued work is kept on this device and syncs
            automatically once you&apos;re back online.
          </p>

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
