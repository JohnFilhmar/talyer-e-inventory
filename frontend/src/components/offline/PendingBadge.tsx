import React from 'react';
import Link from 'next/link';

interface PendingBadgeProps {
  /**
   * Total outbox entries — `pending`, `syncing`, and `rejected` combined,
   * not just `pending`. A rejected order still has not synced and still
   * needs a human to look at it (that is the whole point of Task 7), so
   * excluding it here would let the badge go quiet at exactly the moment a
   * sale was actually lost. `null` while the first read is in flight is
   * treated the same as 0 (render nothing) — nothing to report yet.
   */
  count: number | null;
  /** `icon`: compact, icon-only slot for the desktop navbar row (no
   * horizontal width beyond the icon itself — the count renders as a
   * corner badge, not inline text, so it can't reintroduce overflow).
   * `row`: full-width list item for the mobile hamburger panel, matching
   * the other items there. */
  variant: 'icon' | 'row';
  /** Whether the current route is `/sync`, to match the active-item
   * treatment (icon + label) the rest of the navbar uses. */
  active?: boolean;
  /** Mobile panel only: closes the hamburger menu on navigation. */
  onNavigate?: () => void;
}

const SyncIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);

/**
 * Navbar entry point into the offline sync review queue (`/sync`). Renders
 * nothing when the queue is empty — a badge that always shows "0" trains
 * people to stop reading it, which defeats the reason this exists: a
 * rejected offline order is a silent lost sale unless something in the
 * chrome makes it impossible to miss.
 */
export const PendingBadge: React.FC<PendingBadgeProps> = ({
  count,
  variant,
  active = false,
  onNavigate,
}) => {
  if (!count) return null;

  const displayCount = count > 9 ? '9+' : String(count);
  const label = `Sync queue: ${count} item${count === 1 ? '' : 's'} awaiting review`;

  if (variant === 'icon') {
    return (
      <Link
        href="/sync"
        aria-label={label}
        title={label}
        aria-current={active ? 'page' : undefined}
        className={`relative inline-flex items-center rounded-md ${
          active
            ? 'px-3 py-2 text-sm font-medium bg-yellow-100 text-black'
            : 'p-2 text-gray-600 hover:text-black hover:bg-gray-100'
        }`}
      >
        <span className={active ? 'mr-2' : ''} aria-hidden="true">
          {SyncIcon}
        </span>
        {active && 'Sync Queue'}
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] font-bold leading-none text-black ring-2 ring-white"
        >
          {displayCount}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/sync"
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`flex items-center justify-between px-3 py-2 text-base font-medium rounded-md ${
        active ? 'bg-yellow-100 text-black' : 'text-gray-600 hover:text-black hover:bg-gray-100'
      }`}
    >
      <span className="flex items-center">
        <span className="mr-3" aria-hidden="true">
          {SyncIcon}
        </span>
        Sync Queue
      </span>
      <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-yellow-400 text-black text-xs font-bold">
        {count > 99 ? '99+' : count}
      </span>
    </Link>
  );
};

export default PendingBadge;
