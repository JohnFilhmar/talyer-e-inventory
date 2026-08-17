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
 * `error` forces the section open. `expanded` is computed from `isOpen || error`
 * during render rather than synced via an effect + setState — the React
 * Compiler lint in this project rejects setState-in-an-effect, and there is
 * nothing here an effect would do that the pure derivation doesn't already
 * cover. Without it, a validation failure inside a collapsed section would
 * block the submit with nothing visible to explain why.
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
