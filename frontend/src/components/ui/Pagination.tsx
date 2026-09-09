'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

/**
 * Page numbers to render, with ellipses once the list is long enough that
 * showing every page would wrap.
 */
function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i += 1) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}

export interface PaginationProps {
  /** Server-reported page, 1-based. */
  page: number;
  /** Server-reported rows per page. */
  limit: number;
  /** Server-reported total across every page. Not the number of rows on screen. */
  total: number;
  /** Server-reported page count. */
  pages: number;
  onPageChange: (page: number) => void;
  /** Plural noun for the summary line, e.g. "stock records". */
  label?: string;
  className?: string;
}

/**
 * Pagination controls plus an honest summary line.
 *
 * The summary reads from the server's `total`, never from the number of rows
 * rendered. A list that counts what it is showing tells a shop with 300 SKUs
 * that it has 20, which is how a truncated list stays invisible.
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  limit,
  total,
  pages,
  onPageChange,
  label = 'results',
  className = '',
}) => {
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className}`}>
      <p className="text-sm text-gray-500">
        Showing {first} to {last} of {total} {label}
      </p>

      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          <div className="hidden sm:flex items-center gap-1">
            {getPageNumbers(page, pages).map((entry, index) =>
              entry === '...' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  onClick={() => onPageChange(entry as number)}
                  aria-current={page === entry ? 'page' : undefined}
                  className={`w-8 h-8 rounded-md text-sm font-medium ${
                    page === entry
                      ? 'bg-yellow-400 text-black'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {entry}
                </button>
              )
            )}
          </div>

          <span className="sm:hidden text-sm text-gray-600">
            Page {page} of {pages}
          </span>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};
