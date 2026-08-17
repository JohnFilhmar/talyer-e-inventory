'use client';

import React, { useCallback, useState } from 'react';
import { FolderTree } from 'lucide-react';
import { CategoryNode } from './CategoryNode';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import type { Category } from '@/types/category';

interface CategoryTreeProps {
  categories: Category[];
  isLoading?: boolean;
  error?: Error | null;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
  onRestore?: (category: Category) => void;
  restoringId?: string | null;
  onAddChild?: (parentCategory: Category) => void;
  isAdmin?: boolean;
  /**
   * Ancestor chain to force open, e.g. after creating a subcategory.
   *
   * Carries a `nonce` because the path alone is not a usable trigger: two
   * creates under the same parent produce the same `path`, so keying on its
   * contents would skip the second expansion entirely and the new row would
   * never mount. The page bumps `nonce` per request.
   */
  expandRequest?: { nonce: number; path: string[] };
  highlightedId?: string | null;
  getHighlightProps?: (id: string) => { ref?: (node: HTMLElement | null) => void; className: string };
}

/**
 * CategoryTree component
 * 
 * Displays a hierarchical tree view of categories
 */
export const CategoryTree: React.FC<CategoryTreeProps> = ({
  categories,
  isLoading = false,
  error = null,
  onEdit,
  onDelete,
  onRestore,
  restoringId = null,
  onAddChild,
  isAdmin = false,
  expandRequest,
  highlightedId = null,
  getHighlightProps,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Roots default to expanded, matching the behaviour CategoryNode used to
  // implement locally with useState(level === 0).
  //
  // Each id is seeded exactly ONCE. Re-seeding whenever the root list changes
  // would spring a deliberately collapsed root back open every time a category
  // is created or archived, or the archived filter is toggled — the old
  // per-node state never did that, because nodes are keyed by `_id` and are
  // not remounted by a sibling appearing.
  const [seededRootIds, setSeededRootIds] = useState<Set<string>>(new Set());
  const unseededRootIds = categories
    .map((category) => category._id)
    .filter((id) => !seededRootIds.has(id));
  if (unseededRootIds.length > 0) {
    setSeededRootIds((current) => new Set([...current, ...unseededRootIds]));
    setExpandedIds((current) => new Set([...current, ...unseededRootIds]));
  }

  // A newly created subcategory can sit under a collapsed parent, where it is
  // not rendered at all. Opening its whole ancestor chain is what makes the
  // highlight reachable. Keyed on the request's nonce, not on the path's
  // contents, so a repeat create under the same parent expands again.
  const requestNonce = expandRequest?.nonce ?? 0;
  const [seededNonce, setSeededNonce] = useState(0);
  if (requestNonce !== seededNonce) {
    setSeededNonce(requestNonce);
    if (expandRequest?.path.length) {
      setExpandedIds((current) => new Set([...current, ...expandRequest.path]));
    }
  }

  const handleToggleExpand = useCallback((categoryId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-500">Loading categories...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Error loading categories">
        {error.message}
      </Alert>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FolderTree className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No categories yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          {isAdmin
            ? 'Get started by creating your first category to organize your products.'
            : 'No categories have been created yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
      {categories.map((category) => (
        <CategoryNode
          key={category._id}
          category={category}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
          restoringId={restoringId}
          onAddChild={onAddChild}
          isAdmin={isAdmin}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          highlightedId={highlightedId}
          getHighlightProps={getHighlightProps}
        />
      ))}
    </div>
  );
};
