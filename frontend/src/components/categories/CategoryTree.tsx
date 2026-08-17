'use client';

import React, { useCallback, useMemo, useState } from 'react';
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
  /** Ancestor chain to force open, e.g. after creating a subcategory. */
  expandPath?: string[];
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
  expandPath,
  highlightedId = null,
  getHighlightProps,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Roots default to expanded, matching the behaviour CategoryNode used to
  // implement locally with useState(level === 0).
  const rootIds = useMemo(() => categories.map((c) => c._id).join(','), [categories]);
  const [seededRoots, setSeededRoots] = useState('');
  if (rootIds !== seededRoots) {
    setSeededRoots(rootIds);
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const category of categories) next.add(category._id);
      return next;
    });
  }

  // A newly created subcategory can sit under a collapsed parent, where it is
  // not rendered at all. Opening its whole ancestor chain is what makes the
  // highlight reachable.
  const pathKey = (expandPath ?? []).join(',');
  const [seededPath, setSeededPath] = useState('');
  if (pathKey !== seededPath) {
    setSeededPath(pathKey);
    if (expandPath?.length) {
      setExpandedIds((current) => new Set([...current, ...expandPath]));
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
