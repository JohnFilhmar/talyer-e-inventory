'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, FileText, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  type SalesOrder,
  type OrderStatus,
  type PaymentStatus,
  isPopulatedOrderBranch,
  formatPhoneDisplay,
} from '@/types/sales';

interface SalesOrderTableProps {
  orders: SalesOrder[];
  isLoading?: boolean;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

/**
 * Format currency in Philippine Peso
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get order status badge variant
 */
function getOrderStatusVariant(status: OrderStatus): 'secondary' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'pending':
      return 'secondary';
    case 'processing':
      return 'warning';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'error';
    default:
      return 'secondary';
  }
}

/**
 * Get payment status badge variant
 */
function getPaymentStatusVariant(status: PaymentStatus): 'secondary' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'pending':
      return 'secondary';
    case 'partial':
      return 'warning';
    case 'paid':
      return 'success';
    case 'refunded':
      return 'error';
    default:
      return 'secondary';
  }
}

/**
 * Get payment status label
 */
function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'pending':
      return 'Unpaid';
    case 'partial':
      return 'Partial';
    case 'paid':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
}

interface SortHeaderProps {
  label: string;
  field: string;
  currentField: string;
  currentOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

function SortHeader({ label, field, currentField, currentOrder, onSort }: SortHeaderProps) {
  const isActive = currentField === field;

  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-left font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
    >
      {label}
      {isActive ? (
        currentOrder === 'asc' ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )
      ) : (
        <ChevronUp className="w-4 h-4 opacity-0 group-hover:opacity-50" />
      )}
    </button>
  );
}

/**
 * SalesOrderTable component
 *
 * Displays a sortable table of sales orders.
 */
export const SalesOrderTable: React.FC<SalesOrderTableProps> = ({
  orders,
  isLoading = false,
  sortField,
  sortOrder,
  onSortChange,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <Spinner size="lg" />
          <span className="ml-3 text-gray-500">Loading orders...</span>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">No sales orders found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Order ID"
                  field="orderNumber"
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
                Branch
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                Items
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Total"
                  field="total"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onSort={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                Payment
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                Status
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
                    {order.orderNumber}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {order.customer.name}
                    </p>
                    {order.customer.phone && (
                      <p className="text-xs text-gray-500">
                        {formatPhoneDisplay(order.customer.phone)}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {isPopulatedOrderBranch(order.branch) ? order.branch.name : '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {order.items.length}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(order.total)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={getPaymentStatusVariant(order.payment.status)} size="sm">
                    {getPaymentStatusLabel(order.payment.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={getOrderStatusVariant(order.status)} size="sm">
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-500">
                    {formatDate(order.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/sales/${order._id}`}>
                      <Button variant="secondary" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/sales/${order._id}/invoice`}>
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
                  {order.orderNumber}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {order.customer.name}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.total)}
                </p>
                <p className="text-xs text-gray-500">{order.items.length} items</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={getOrderStatusVariant(order.status)} size="sm">
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
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
              <Link href={`/sales/${order._id}`}>
                <Button variant="secondary" size="sm">
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
              </Link>
              <Link href={`/sales/${order._id}/invoice`}>
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

export default SalesOrderTable;
