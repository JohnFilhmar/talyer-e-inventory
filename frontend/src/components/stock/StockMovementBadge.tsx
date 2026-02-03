'use client';

import React from 'react';
import {
  Package,
  Plus,
  Minus,
  ShoppingCart,
  X,
  Wrench,
  ArrowRight,
  ArrowLeft,
  Box,
} from 'lucide-react';
import { MOVEMENT_TYPE_CONFIG, type MovementType } from '@/types/stock';

interface StockMovementBadgeProps {
  type: MovementType;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Icon mapping for movement types
 */
const iconMap = {
  package: Package,
  plus: Plus,
  minus: Minus,
  cart: ShoppingCart,
  x: X,
  wrench: Wrench,
  'arrow-right': ArrowRight,
  'arrow-left': ArrowLeft,
  box: Box,
};

/**
 * Color classes for movement types
 */
const colorClasses = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

/**
 * StockMovementBadge component
 * 
 * Displays a colored badge with icon for stock movement types
 */
export const StockMovementBadge: React.FC<StockMovementBadgeProps> = ({
  type,
  showLabel = true,
  size = 'md',
}) => {
  const config = MOVEMENT_TYPE_CONFIG[type];
  if (!config) return null;

  const Icon = iconMap[config.icon];
  const colorClass = colorClasses[config.color];
  const sizeClass = size === 'sm' 
    ? 'px-2 py-0.5 text-xs' 
    : 'px-2.5 py-1 text-sm';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full ${colorClass} ${sizeClass}`}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};

export default StockMovementBadge;
