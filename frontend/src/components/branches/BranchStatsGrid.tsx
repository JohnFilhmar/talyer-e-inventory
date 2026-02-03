'use client';

import React from 'react';
import type { BranchStats } from '@/types/branch';
import { Spinner } from '@/components/ui/Spinner';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  isLoading?: boolean;
}

/**
 * Individual stat card component
 */
const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, isLoading }) => (
  <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {isLoading ? (
          <div className="mt-1">
            <Spinner size="sm" />
          </div>
        ) : (
          <>
            <p className="mt-1 text-2xl font-bold text-black">{value}</p>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </>
        )}
      </div>
      <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center text-yellow-600">
        {icon}
      </div>
    </div>
  </div>
);

interface BranchStatsGridProps {
  stats: BranchStats | null | undefined;
  isLoading?: boolean;
}

/**
 * BranchStatsGrid component
 * 
 * Displays branch statistics in a responsive grid
 */
export const BranchStatsGrid: React.FC<BranchStatsGridProps> = ({ stats, isLoading }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Staff Stats */}
      <StatCard
        title="Staff"
        value={stats?.staff.total ?? '—'}
        subtitle={stats ? `${stats.staff.active} active, ${stats.staff.inactive} inactive` : undefined}
        isLoading={isLoading}
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
      />

      {/* Inventory Stats */}
      <StatCard
        title="Inventory"
        value={stats?.inventory.totalProducts ?? '—'}
        subtitle={stats ? `${stats.inventory.lowStockItems} low stock items` : undefined}
        isLoading={isLoading}
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        }
      />

      {/* Sales Stats */}
      <StatCard
        title="Total Revenue"
        value={stats ? `₱${stats.sales.totalRevenue.toLocaleString()}` : '—'}
        subtitle={stats ? `${stats.sales.totalOrders} total orders` : undefined}
        isLoading={isLoading}
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  );
};

export default BranchStatsGrid;
