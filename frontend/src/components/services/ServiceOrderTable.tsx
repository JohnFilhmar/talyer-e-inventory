'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, FileText, ChevronUp, ChevronDown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import {
  ServiceOrder,
  ServiceStatus,
  ServicePaymentStatus,
  ServicePriority,
  isPopulatedServiceUser,
  formatCurrency,
  formatDate,
} from '@/types/service';

// ============ Types ============

interface ServiceOrderTableProps {
  orders: ServiceOrder[];
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
  onAssignMechanic?: (order: ServiceOrder) => void;
}

interface SortHeaderProps {
  label: string;
  field: string;
  currentField: string;
  currentOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

// ============ Helper Functions ============

function getStatusVariant(status: ServiceStatus): BadgeVariant {
  const variants: Record<ServiceStatus, BadgeVariant> = {
    pending: 'warning',
    scheduled: 'info',
    'in-progress': 'warning',
    completed: 'success',
    cancelled: 'error',
  };
  return variants[status] || 'secondary';
}

function getPriorityVariant(priority: ServicePriority): BadgeVariant {
  const variants: Record<ServicePriority, BadgeVariant> = {
    low: 'secondary',
    normal: 'info',
    high: 'warning',
    urgent: 'error',
  };
  return variants[priority] || 'secondary';
}

function getPaymentStatusVariant(status: ServicePaymentStatus): BadgeVariant {
  const variants: Record<ServicePaymentStatus, BadgeVariant> = {
    pending: 'secondary',
    partial: 'warning',
    paid: 'success',
  };
  return variants[status] || 'secondary';
}

function getPaymentStatusLabel(status: ServicePaymentStatus): string {
  const labels: Record<ServicePaymentStatus, string> = {
    pending: 'Unpaid',
    partial: 'Partial',
    paid: 'Paid',
  };
  return labels[status] || status;
}

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

function getPriorityLabel(priority: ServicePriority): string {
  const labels: Record<ServicePriority, string> = {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
    urgent: 'Urgent',
  };
  return labels[priority] || priority;
}

function formatVehicleDisplay(vehicle: ServiceOrder['vehicle'] | undefined): string {
  if (!vehicle) return 'No vehicle info';
  const parts: string[] = [];
  if (vehicle.make) parts.push(vehicle.make);
  if (vehicle.model) parts.push(vehicle.model);
  if (vehicle.year) parts.push(`(${vehicle.year})`);
  return parts.length > 0 ? parts.join(' ') : 'No vehicle info';
}

// ============ Sort Header Component ============

const SortHeader: React.FC<SortHeaderProps> = ({
  label,
  field,
  currentField,
  currentOrder,
  onSort,
}) => {
  const isActive = currentField === field;
  
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      {label}
      <span className="flex flex-col">
        <ChevronUp
          className={`w-3 h-3 -mb-1 ${
            isActive && currentOrder === 'asc'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        />
        <ChevronDown
          className={`w-3 h-3 ${
            isActive && currentOrder === 'desc'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        />
      </span>
    </button>
  );
};

// ============ Main Component ============

const ServiceOrderTable: React.FC<ServiceOrderTableProps> = ({
  orders,
  sortField,
  sortOrder,
  onSortChange,
  onAssignMechanic,
}) => {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">No service orders found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Job #"
                  field="jobNumber"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Customer"
                  field="customer.name"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                Vehicle
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                Assigned To
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                Priority
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                Status
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Total"
                  field="totalAmount"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                Payment
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Date"
                  field="createdAt"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {orders.map((order) => (
              <tr
                key={order._id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                    {order.jobNumber}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {order.customer?.name || 'Unknown Customer'}
                    </p>
                    {order.customer?.phone && (
                      <p className="text-xs text-gray-500">
                        {order.customer.phone}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatVehicleDisplay(order.vehicle)}
                    </p>
                    {order.vehicle?.plateNumber && (
                      <p className="text-xs font-mono text-gray-500">
                        {order.vehicle.plateNumber}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {isPopulatedServiceUser(order.assignedTo) ? (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {order.assignedTo.firstName} {order.assignedTo.lastName}
                    </span>
                  ) : order.status !== 'completed' && order.status !== 'cancelled' && onAssignMechanic ? (
                    <button
                      onClick={() => onAssignMechanic(order)}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" />
                      Assign
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-gray-500">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={getPriorityVariant(order.priority)} size="sm">
                    {getPriorityLabel(order.priority)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={getStatusVariant(order.status)} size="sm">
                    {getStatusLabel(order.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(order.totalAmount)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={getPaymentStatusVariant(order.payment.status)} size="sm">
                    {getPaymentStatusLabel(order.payment.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-500">
                    {formatDate(order.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/services/${order._id}`}>
                      <Button variant="secondary" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/services/${order._id}/invoice`}>
                      <Button variant="secondary" size="sm">
                        <FileText className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden divide-y divide-gray-200 dark:divide-gray-700">
        {orders.map((order) => (
          <div key={order._id} className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                  {order.jobNumber}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {order.customer?.name || 'Unknown Customer'}
                </p>
                {order.vehicle?.plateNumber && (
                  <p className="text-xs font-mono text-gray-500">
                    {order.vehicle.plateNumber}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.totalAmount)}
                </p>
                {isPopulatedServiceUser(order.assignedTo) && (
                  <p className="text-xs text-gray-500">
                    {order.assignedTo.firstName} {order.assignedTo.lastName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={getStatusVariant(order.status)} size="sm">
                  {getStatusLabel(order.status)}
                </Badge>
                <Badge variant={getPriorityVariant(order.priority)} size="sm">
                  {getPriorityLabel(order.priority)}
                </Badge>
                <Badge variant={getPaymentStatusVariant(order.payment.status)} size="sm">
                  {getPaymentStatusLabel(order.payment.status)}
                </Badge>
              </div>
              <span className="text-xs text-gray-500">
                {formatDate(order.createdAt)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {!isPopulatedServiceUser(order.assignedTo) &&
                order.status !== 'completed' &&
                order.status !== 'cancelled' &&
                onAssignMechanic && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAssignMechanic(order)}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Assign
                  </Button>
                )}
              <Link href={`/services/${order._id}`}>
                <Button variant="secondary" size="sm">
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
              </Link>
              <Link href={`/services/${order._id}/invoice`}>
                <Button variant="secondary" size="sm">
                  <FileText className="w-4 h-4 mr-1" />
                  Invoice
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ServiceOrderTable;
