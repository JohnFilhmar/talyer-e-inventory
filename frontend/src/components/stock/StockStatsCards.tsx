'use client';

import React from 'react';
import {
  Package,
  AlertTriangle,
  TrendingUp,
  ArrowUpDown,
} from 'lucide-react';

interface StockStats {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

interface StockStatsCardsProps {
  stats?: StockStats;
  isLoading?: boolean;
}

/**
 * Format price in Philippine Peso
 */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'yellow' | 'green' | 'orange' | 'red';
  isLoading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, isLoading }) => {
  const colorClasses = {
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          {isLoading ? (
            <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * StockStatsCards component
 * 
 * Displays key stock statistics in a card grid layout.
 */
export const StockStatsCards: React.FC<StockStatsCardsProps> = ({
  stats,
  isLoading = false,
}) => {
  const totalItems = stats?.totalItems ?? 0;
  const totalValue = stats?.totalValue ?? 0;
  const lowStockCount = stats?.lowStockCount ?? 0;
  const outOfStockCount = stats?.outOfStockCount ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Stock Items"
        value={totalItems.toLocaleString()}
        icon={<Package className="w-6 h-6" />}
        color="yellow"
        isLoading={isLoading}
      />
      <StatCard
        title="Total Stock Value"
        value={formatPrice(totalValue)}
        icon={<TrendingUp className="w-6 h-6" />}
        color="green"
        isLoading={isLoading}
      />
      <StatCard
        title="Low Stock Items"
        value={lowStockCount.toLocaleString()}
        icon={<AlertTriangle className="w-6 h-6" />}
        color="orange"
        isLoading={isLoading}
      />
      <StatCard
        title="Out of Stock"
        value={outOfStockCount.toLocaleString()}
        icon={<ArrowUpDown className="w-6 h-6" />}
        color="red"
        isLoading={isLoading}
      />
    </div>
  );
};

export default StockStatsCards;
