'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Edit, Trash2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { Category } from '@/types/category';

interface CategoryNodeProps {
  category: Category;
  level?: number;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
  /** Bring an archived category back. Only offered on archived rows. */
  onRestore?: (category: Category) => void;
  /** Id currently being restored, so the row can show progress. */
  restoringId?: string | null;
  onAddChild?: (parentCategory: Category) => void;
  isAdmin?: boolean;
}

/**
 * CategoryNode component
 * 
 * Renders a single category in the tree with expand/collapse functionality
 */
export const CategoryNode: React.FC<CategoryNodeProps> = ({
  category,
  level = 0,
  onEdit,
  onDelete,
  onRestore,
  restoringId = null,
  onAddChild,
  isAdmin = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = category.children && category.children.length > 0;

  const toggleExpand = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const isRestoring = restoringId === category._id;

  return (
    <div className="select-none">
      {/* Category row */}
      <div
        className={`
          flex items-center gap-2 py-2 px-3 rounded-lg
          hover:bg-gray-50 dark:hover:bg-gray-800
          transition-colors duration-150
          group
        `}
        style={{ paddingLeft: `${level * 24 + 12}px` }}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={toggleExpand}
          className={`
            w-6 h-6 flex items-center justify-center rounded
            transition-colors duration-150
            ${hasChildren ? 'hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer' : 'cursor-default opacity-0'}
          `}
          tabIndex={hasChildren ? 0 : -1}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren && (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )
          )}
        </button>

        {/* Folder icon with optional color */}
        <div
          className="flex items-center justify-center w-6 h-6"
          style={{ color: category.color ?? '#6B7280' }}
        >
          {isExpanded && hasChildren ? (
            <FolderOpen className="w-5 h-5" />
          ) : (
            <Folder className="w-5 h-5" />
          )}
        </div>

        {/* Category name and code */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {category.name}
          </span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            ({category.code})
          </span>
        </div>

        {/* Product count badge */}
        {category.productCount !== undefined && category.productCount > 0 && (
          <Badge variant="secondary" size="sm">
            {category.productCount} products
          </Badge>
        )}

        {/* Status badge. Wording matches the Show archived toggle — deleting a
            category archives it rather than removing the row. */}
        {!category.isActive && (
          <Badge variant="warning" size="sm">
            Archived
          </Badge>
        )}

        {/* Action buttons (admin only).
            Always visible. These used to be opacity-0 until group-hover, which
            meant they did not exist at all on a tablet — there is no hover on a
            touch screen, and a tablet on the counter is the primary device. */}
        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onAddChild?.(category)}
              title="Add subcategory"
              aria-label={`Add subcategory under ${category.name}`}
              className="h-9 w-9 flex items-center justify-center rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit?.(category)}
              title="Edit category"
              aria-label={`Edit ${category.name}`}
              className="h-9 w-9 flex items-center justify-center rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <Edit className="w-4 h-4" />
            </button>
            {/* Archive and restore are mutually exclusive — an archived row
                has nothing to archive, an active one nothing to restore. */}
            {category.isActive ? (
              <button
                type="button"
                onClick={() => onDelete?.(category)}
                title="Archive category"
                aria-label={`Archive ${category.name}`}
                className="h-9 w-9 flex items-center justify-center rounded text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              onRestore && (
                <button
                  type="button"
                  onClick={() => onRestore(category)}
                  disabled={isRestoring}
                  title="Restore category"
                  aria-label={`Restore ${category.name}`}
                  className="inline-flex items-center gap-1 h-9 px-2 rounded text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Vertical line connector */}
          <div
            className="absolute left-0 top-0 bottom-0 border-l-2 border-gray-200 dark:border-gray-700"
            style={{ marginLeft: `${(level + 1) * 24 + 23}px` }}
          />
          {category.children!.map((child) => (
            <CategoryNode
              key={child._id}
              category={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onRestore={onRestore}
              restoringId={restoringId}
              onAddChild={onAddChild}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
};
