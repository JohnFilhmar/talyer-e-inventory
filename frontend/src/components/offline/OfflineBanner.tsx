'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { isOffline } from '@/lib/offline/cache';

/**
 * Persistent, non-dismissable bar shown for as long as the browser reports
 * no network connectivity. It exists to make the offline-first behaviour
 * legible: a sale or job taken offline is queued to the outbox (Task 6)
 * rather than lost, and this banner is what tells the person at the
 * counter that's what's happening instead of letting them wonder why
 * nothing seems to be saving.
 *
 * `navigator.onLine` is only trustworthy in the negative — `false` reliably
 * means the network interface is down, but `true` only means an interface
 * is up, not that the API is reachable. So this component is driven purely
 * by the `offline`/`online` events (via `isOffline()`, the same helper
 * `cache.ts` and the outbox hooks use) and only ever asserts the claim it
 * can back up: "you have no connection." It does not flip to a "back
 * online, syncing" message when the `online` event fires — that would be
 * claiming the server is reachable and a sync is underway on nothing more
 * than an interface state change. The banner just disappears; actual sync
 * outcomes (including rejections) surface on `/sync` via `PendingBadge`.
 *
 * No transitions/animations per the design constraints — it simply mounts
 * and unmounts with the offline state.
 */
export const OfflineBanner: React.FC = () => {
  // Lazy initializer reads the real browser state at mount time (it only
  // runs once, on the client — 'use client' components re-run it during
  // hydration rather than reusing whatever a server render produced), so
  // no separate effect-body setState is needed just to reconcile SSR vs.
  // client on first paint. The effect below exists purely to subscribe to
  // subsequent `online`/`offline` events.
  const [offline, setOffline] = useState(isOffline);

  useEffect(() => {
    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-yellow-400 text-black border-b border-black/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 text-sm font-medium">
        <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          You&apos;re offline. Changes are being saved on this device and will sync automatically
          once you&apos;re back online.
        </span>
      </div>
    </div>
  );
};

export default OfflineBanner;
