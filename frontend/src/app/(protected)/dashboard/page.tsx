'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSalesStats } from '@/hooks/useSales';
import { useLowStock } from '@/hooks/useStock';
import { useMyJobs, useServiceOrders } from '@/hooks/useServices';
import { formatCurrency } from '@/types/service';
import { Spinner } from '@/components/ui';

/**
 * Dashboard card component for stats
 */
interface StatCardProps {
  title: string;
  value: string | number | undefined;
  icon: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  /** Where the underlying records live, so a number is a way in and not a dead end. */
  href?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, isLoading, isError, href }) => {
  const body = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="mt-1 text-2xl font-bold text-black">
          {isLoading ? (
            <Spinner size="sm" />
          ) : isError ? (
            <span className="text-sm font-medium text-red-600">Unavailable</span>
          ) : (
            value
          )}
        </div>
      </div>
      <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center text-yellow-600">
        {icon}
      </div>
    </div>
  );

  const shell = 'bg-white rounded-lg shadow-md border border-gray-200 p-6';

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link href={href} className={`${shell} block hover:border-yellow-400`}>
      {body}
    </Link>
  );
};

/**
 * Quick action button component
 *
 * This used to render a bare `<button>` with no handler while declaring an
 * `href` it never destructured, so every action on the post-login landing page
 * was inert. It is a `Link` now, and the paths it points at are checked against
 * the routes that exist: there is no `/inventory`, no `/inventory/new` and no
 * `/reports`.
 */
interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}

const QuickAction: React.FC<QuickActionProps> = ({ title, description, icon, href }) => (
  <Link
    href={href}
    className="flex items-center p-4 bg-white rounded-lg shadow-md border border-gray-200 hover:border-yellow-400 text-left w-full"
  >
    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4 text-gray-600">
      {icon}
    </div>
    <div>
      <p className="font-medium text-black">{title}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  </Link>
);

const ICONS = {
  peso: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  receipt: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  warning: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  wrench: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  calendar: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

/**
 * The figures an admin or a salesperson sees.
 *
 * Split into its own component because `GET /sales/stats` and
 * `GET /stock/low-stock` are both `authorize(ADMIN, SALESPERSON)`. Calling
 * their hooks unconditionally would give every mechanic two 403s on the first
 * screen after login, and a hook cannot be called conditionally.
 *
 * Nothing here passes a branch. Non-admins are already clamped to their own
 * branch by the server, and an admin legitimately wants the whole business, so
 * the scoping the rest of the app uses is the scoping these numbers get.
 */
const SalesStatCards: React.FC = () => {
  const stats = useSalesStats();
  const lowStock = useLowStock({ limit: 1 });
  const jobs = useServiceOrders({ status: 'in-progress', limit: 1 });

  return (
    <>
      <StatCard
        title="Today's sales"
        value={stats.data ? formatCurrency(stats.data.revenue.today) : undefined}
        isLoading={stats.isLoading}
        isError={stats.isError}
        icon={ICONS.peso}
        href="/sales"
      />
      <StatCard
        title="Pending orders"
        value={stats.data?.orders.pending}
        isLoading={stats.isLoading}
        isError={stats.isError}
        icon={ICONS.receipt}
        href="/sales?status=pending"
      />
      <StatCard
        title="Low stock items"
        value={lowStock.data?.pagination?.total ?? lowStock.data?.data.length}
        isLoading={lowStock.isLoading}
        isError={lowStock.isError}
        icon={ICONS.warning}
        href="/stock"
      />
      <StatCard
        title="Jobs in progress"
        value={jobs.data?.pagination?.total ?? jobs.data?.data.length}
        isLoading={jobs.isLoading}
        isError={jobs.isError}
        icon={ICONS.wrench}
        href="/services"
      />
    </>
  );
};

/**
 * The figures a mechanic sees.
 *
 * Deliberately not revenue: `GET /sales/stats` refuses a mechanic, and the
 * shop's takings are not a mechanic's business. `GET /services/my-jobs` is
 * mechanic-only and already scoped to the person asking.
 */
const MechanicStatCards: React.FC = () => {
  const inProgress = useMyJobs({ status: 'in-progress', limit: 1 });
  const scheduled = useMyJobs({ status: 'scheduled', limit: 1 });

  return (
    <>
      <StatCard
        title="My jobs in progress"
        value={inProgress.data?.pagination?.total ?? inProgress.data?.data.length}
        isLoading={inProgress.isLoading}
        isError={inProgress.isError}
        icon={ICONS.wrench}
        href="/services/my-jobs"
      />
      <StatCard
        title="Scheduled for me"
        value={scheduled.data?.pagination?.total ?? scheduled.data?.data.length}
        isLoading={scheduled.isLoading}
        isError={scheduled.isError}
        icon={ICONS.calendar}
        href="/services/my-jobs"
      />
    </>
  );
};

/**
 * Dashboard page component
 *
 * Features:
 * - Welcome message with user name
 * - Stats overview cards, scoped to what the user's role may actually read
 * - Quick actions, every one of them a link to a route that exists
 */
export default function DashboardPage() {
  const { user, isAdmin, hasRole } = useAuth();

  const canReadSalesStats = isAdmin() || hasRole(['salesperson']);
  const isMechanic = hasRole(['mechanic']);

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-black">
          Welcome back, {user?.name?.split(' ')[0] || 'User'}!
        </h1>
        <p className="mt-1 text-gray-600">
          Here is what is happening with your inventory today.
        </p>
      </div>

      {/* Stats Overview */}
      {(canReadSalesStats || isMechanic) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {canReadSalesStats ? <SalesStatCards /> : <MechanicStatCards />}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-black mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Show different actions based on role */}
          {(isAdmin() || hasRole(['salesperson'])) && (
            <QuickAction
              title="New Sale"
              description="Create a new sales order"
              href="/sales/new"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              }
            />
          )}
          {(isAdmin() || hasRole(['salesperson'])) && (
            <QuickAction
              title="Check Inventory"
              description="View current stock levels"
              href="/stock"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              }
            />
          )}
          {hasRole(['mechanic']) && (
            <QuickAction
              title="My Service Jobs"
              description="Jobs assigned to you"
              href="/services/my-jobs"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
          )}
          {(isAdmin() || hasRole(['salesperson'])) && (
            <QuickAction
              title="Service Jobs"
              description="All service orders"
              href="/services"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
          )}
          {isAdmin() && (
            <>
              <QuickAction
                title="Add Product"
                description="Add new inventory item"
                href="/products/new"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                }
              />
              <QuickAction
                title="Manage Users"
                description="User administration"
                href="/users"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
