'use client';

import React from 'react';
import {
  Wrench,
  Clock,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { ServiceStats } from '@/types/service';

interface ServiceStatsCardsProps {
  stats?: ServiceStats;
  isLoading?: boolean;
}

/**
 * Format currency in Philippine Peso
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  bgColor: string;
  iconColor: string;
  isLoading?: boolean;
}

function StatCard({ title, value, icon, bgColor, iconColor, isLoading }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 ${bgColor} rounded-lg`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{title}</p>
          {isLoading ? (
            <div className="flex items-center mt-1">
              <Spinner size="sm" />
            </div>
          ) : (
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {value}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ServiceStatsCards component
 *
 * Displays key service statistics in a grid of cards.
 */
export const ServiceStatsCards: React.FC<ServiceStatsCardsProps> = ({
  stats,
  isLoading = false,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Jobs"
        value={stats?.totalJobs ?? 0}
        icon={<Wrench className="w-5 h-5 sm:w-6 sm:h-6" />}
        bgColor="bg-blue-100 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
        isLoading={isLoading}
      />
      <StatCard
        title="In Progress"
        value={stats?.inProgressJobs ?? 0}
        icon={<Clock className="w-5 h-5 sm:w-6 sm:h-6" />}
        bgColor="bg-yellow-100 dark:bg-yellow-900/30"
        iconColor="text-yellow-600 dark:text-yellow-400"
        isLoading={isLoading}
      />
      <StatCard
        title="Scheduled"
        value={stats?.scheduledJobs ?? 0}
        icon={<Calendar className="w-5 h-5 sm:w-6 sm:h-6" />}
        bgColor="bg-purple-100 dark:bg-purple-900/30"
        iconColor="text-purple-600 dark:text-purple-400"
        isLoading={isLoading}
      />
      <StatCard
        title="Today's Revenue"
        value={formatCurrency(stats?.todayRevenue ?? 0)}
        icon={<DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />}
        bgColor="bg-green-100 dark:bg-green-900/30"
        iconColor="text-green-600 dark:text-green-400"
        isLoading={isLoading}
      />
    </div>
  );
};

export default ServiceStatsCards;
