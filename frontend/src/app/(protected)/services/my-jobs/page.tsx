'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Wrench, RefreshCw, Eye, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useMyJobs } from '@/hooks/useServices';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
  ServiceStatus,
  ServicePriority,
  SERVICE_PRIORITY_OPTIONS,
  MyJobsParams,
  formatCurrency,
  formatDate,
} from '@/types/service';

/**
 * Get service status badge variant
 */
function getStatusVariant(status: ServiceStatus): 'secondary' | 'warning' | 'success' | 'error' | 'info' {
  const variants: Record<ServiceStatus, 'secondary' | 'warning' | 'success' | 'error' | 'info'> = {
    pending: 'secondary',
    scheduled: 'info',
    'in-progress': 'warning',
    completed: 'success',
    cancelled: 'error',
  };
  return variants[status] || 'secondary';
}

/**
 * Get priority badge variant
 */
function getPriorityVariant(priority: ServicePriority): 'secondary' | 'warning' | 'error' | 'info' {
  const variants: Record<ServicePriority, 'secondary' | 'warning' | 'error' | 'info'> = {
    low: 'secondary',
    normal: 'info',
    high: 'warning',
    urgent: 'error',
  };
  return variants[priority] || 'secondary';
}

/**
 * Get status label
 */
function getStatusLabel(status: ServiceStatus): string {
  const labels: Record<ServiceStatus, string> = {
    pending: 'Pending',
    scheduled: 'Scheduled',
    'in-progress': 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Get priority label
 */
function getPriorityLabel(priority: ServicePriority): string {
  const labels: Record<ServicePriority, string> = {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
    urgent: 'Urgent',
  };
  return labels[priority] || priority;
}

/**
 * My Jobs Page
 *
 * Shows service orders assigned to the current mechanic.
 * Organized by status with quick filters.
 */
export default function MyJobsPage() {
  // Filter state
  const [selectedStatus, setSelectedStatus] = useState<ServiceStatus | ''>('');
  const [selectedPriority, setSelectedPriority] = useState<ServicePriority | ''>('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Build params
  const params: MyJobsParams = useMemo(() => {
    const p: MyJobsParams = { page, limit };
    if (selectedStatus) p.status = selectedStatus;
    if (selectedPriority) p.priority = selectedPriority;
    return p;
  }, [page, limit, selectedStatus, selectedPriority]);

  // Fetch my jobs
  const {
    data: jobsData,
    isLoading,
    error,
    refetch,
  } = useMyJobs(params);

  const jobs = useMemo(() => jobsData?.data || [], [jobsData]);
  const pagination = jobsData?.pagination;

  // Group jobs by status for summary
  const jobsByStatus = useMemo(() => {
    const grouped = {
      'in-progress': 0,
      scheduled: 0,
      pending: 0,
      completed: 0,
    };
    jobs.forEach((job) => {
      if (job.status in grouped) {
        grouped[job.status as keyof typeof grouped]++;
      }
    });
    return grouped;
  }, [jobs]);

  // Handle filter reset
  const handleResetFilters = useCallback(() => {
    setSelectedStatus('');
    setSelectedPriority('');
    setPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
            <Wrench className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              My Jobs
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Service orders assigned to you
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          Failed to load your jobs: {error.message}
        </Alert>
      )}

      {/* Quick Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => {
            setSelectedStatus('in-progress');
            setPage(1);
          }}
          className={`bg-white dark:bg-gray-900 rounded-lg border p-4 text-left transition-colors ${
            selectedStatus === 'in-progress'
              ? 'border-yellow-500 ring-2 ring-yellow-500/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-yellow-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {jobsByStatus['in-progress']}
          </p>
        </button>

        <button
          onClick={() => {
            setSelectedStatus('scheduled');
            setPage(1);
          }}
          className={`bg-white dark:bg-gray-900 rounded-lg border p-4 text-left transition-colors ${
            selectedStatus === 'scheduled'
              ? 'border-blue-500 ring-2 ring-blue-500/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Scheduled</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {jobsByStatus.scheduled}
          </p>
        </button>

        <button
          onClick={() => {
            setSelectedStatus('pending');
            setPage(1);
          }}
          className={`bg-white dark:bg-gray-900 rounded-lg border p-4 text-left transition-colors ${
            selectedStatus === 'pending'
              ? 'border-gray-500 ring-2 ring-gray-500/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Pending</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {jobsByStatus.pending}
          </p>
        </button>

        <button
          onClick={() => {
            setSelectedStatus('completed');
            setPage(1);
          }}
          className={`bg-white dark:bg-gray-900 rounded-lg border p-4 text-left transition-colors ${
            selectedStatus === 'completed'
              ? 'border-green-500 ring-2 ring-green-500/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-green-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Completed</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {jobsByStatus.completed}
          </p>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">Priority:</label>
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value as ServicePriority | '');
                setPage(1);
              }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">All Priorities</option>
              {SERVICE_PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {(selectedStatus || selectedPriority) && (
            <button
              onClick={handleResetFilters}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Jobs List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-3 text-gray-500">Loading your jobs...</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <Wrench className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No jobs found
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {selectedStatus || selectedPriority
              ? 'Try adjusting your filters'
              : "You don't have any assigned jobs yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div
              key={job._id}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                      {job.jobNumber}
                    </span>
                    <Badge variant={getStatusVariant(job.status)} size="sm">
                      {getStatusLabel(job.status)}
                    </Badge>
                    <Badge variant={getPriorityVariant(job.priority)} size="sm">
                      {getPriorityLabel(job.priority)}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {job.customer?.name || 'Unknown Customer'}
                    {job.vehicle?.plateNumber && (
                      <span className="font-mono ml-2">• {job.vehicle.plateNumber}</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 line-clamp-2">{job.description}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(job.totalAmount)}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(job.createdAt)}</p>
                  </div>
                  <Link href={`/services/${job._id}`}>
                    <Button variant="secondary" size="sm">
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > limit && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {page} of {pagination.pages || Math.ceil(pagination.total / limit)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= (pagination.pages || Math.ceil(pagination.total / limit))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Results Summary */}
      {!isLoading && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          Showing {jobs.length} of {pagination?.total || jobs.length} jobs
        </div>
      )}
    </div>
  );
}
