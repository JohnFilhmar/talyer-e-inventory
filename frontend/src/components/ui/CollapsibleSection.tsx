'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  /** Open on first render. Changing it later does not re-open the section. */
  defaultOpen?: boolean;
  /** Count or short label shown beside the title, e.g. `3` renders "Tags (3)". */
  badge?: number | string;
  /** Force the section open and mark the header. Set when it holds an invalid field. */
  error?: boolean;
  className?: string;
}

/**
 * A form section the user can fold away.
 *
 * Content is hidden with the `hidden` attribute rather than unmounted, so every
 * input inside stays registered with react-hook-form and a collapsed section
 * still submits its values. Unmounting would silently drop them.
 *
 * `error` forces the section open, and `expanded` stays `isOpen || error` so a
 * click on the header can never close it while an error stands. But `isOpen`
 * itself has to be persisted to `true` the moment `error` turns on, not just
 * derived for display: if it were derived only, the section would snap shut
 * the instant the error cleared (e.g. the user fixes the field and
 * react-hook-form re-validates) even though the user never touched the
 * header and is still looking at it. This uses the same derive-during-render
 * pattern as `ProductFilters` — comparing `error` to its previous value
 * during render — rather than a `useEffect` + `setIsOpen`, which the React
 * Compiler lint here rejects.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  badge,
  error = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Persist isOpen to true when error turns on, so clearing the error later
  // leaves the section open instead of folding it away under the user.
  const [prevError, setPrevError] = useState(error);
  if (error !== prevError) {
    setPrevError(error);
    if (error) setIsOpen(true);
  }

  const contentId = `collapsible-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const expanded = isOpen || error;

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-lg border ${
        error ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'
      } ${className}`}
    >
      {/* type="button" is load-bearing: the default submit type would make
          folding a section submit the form it lives in. */}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 px-6 py-4 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />
        )}

        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>

        {badge !== undefined && badge !== '' && badge !== 0 && (
          <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-medium text-black">
            {badge}
          </span>
        )}

        {error && (
          <span className="ml-auto text-sm font-medium text-red-600 dark:text-red-400">
            Needs attention
          </span>
        )}
      </button>

      <div id={contentId} hidden={!expanded} className="px-6 pb-6">
        {children}
      </div>
    </div>
  );
};

export default CollapsibleSection;
