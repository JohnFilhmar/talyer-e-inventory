'use client';

import React, { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { isOffline } from '@/lib/offline/cache';

/**
 * Subscribes to the browser's connectivity events.
 *
 * `useSyncExternalStore` is the right primitive here rather than
 * `useState` + `useEffect`: it takes a separate server snapshot, so the
 * server render and the hydration render agree on "online" while the client
 * immediately reads the real value afterwards. A lazy `useState` initializer
 * cannot do this — `'use client'` still means server-*rendered* in the App
 * Router, so the initializer runs where `navigator` does not exist, and
 * hydration then reuses that stale `false`. When the browser was already
 * offline before the page loaded, no `offline` event ever fires to correct
 * it, and the banner would never appear after a reload — precisely when it
 * matters most.
 */
const subscribeToConnectivity = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

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
  const offline = useSyncExternalStore(
    subscribeToConnectivity,
    isOffline,
    // Server snapshot: assume online. The server cannot know, and rendering
    // the banner into the initial HTML would flash it for every online user.
    () => false
  );

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
