'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingCart,
  FileText,
  CreditCard,
  RefreshCw,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Hash,
  Building,
} from 'lucide-react';
import { useSalesOrder } from '@/hooks/useSales';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { UpdateStatusModal, UpdatePaymentModal } from '@/components/sales';
import {
  type OrderStatus,
  type PaymentStatus,
  getValidNextStatuses,
  formatPhoneDisplay,
  isPopulatedOrderBranch,
  isPopulatedOrderUser,
  isPopulatedOrderProduct,
} from '@/types/sales';

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
    month: 'long',
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
 * Get payment method label
 */
function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    gcash: 'GCash',
    paymaya: 'PayMaya',
    'bank-transfer': 'Bank Transfer',
  };
  return labels[method] || method;
}

/**
 * Order Detail Page
 *
 * Shows full details of a sales order with ability to update
 * status and payment information.
 */
export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  // Modal states
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Fetch order data
  const { data: order, isLoading, error, refetch } = useSalesOrder(orderId);

  // Check if status can be updated
  const canUpdateStatus = useMemo(() => {
    if (!order) return false;
    return getValidNextStatuses(order.status).length > 0;
  }, [order]);

  // Check if payment can be updated
  const canUpdatePayment = useMemo(() => {
    if (!order) return false;
    return order.status !== 'cancelled' && order.payment.status !== 'refunded';
  }, [order]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-500">Loading order details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="error">
          Failed to load order: {error.message}
        </Alert>
        <Button variant="secondary" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <Alert variant="error">Order not found.</Alert>
        <Button variant="secondary" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/sales')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Order Details
              </h1>
              <p className="text-sm font-mono text-gray-500 dark:text-gray-400">
                {order.orderNumber}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Link href={`/sales/${orderId}/invoice`}>
            <Button variant="secondary">
              <FileText className="w-4 h-4 mr-2" />
              Invoice
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Order Info & Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Order Status Card */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Order Status</span>
                {canUpdateStatus && (
                  <button
                    onClick={() => setShowStatusModal(true)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Update
                  </button>
                )}
              </div>
              <Badge variant={getOrderStatusVariant(order.status)} size="lg">
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
            </div>

            {/* Payment Status Card */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Payment Status</span>
                {canUpdatePayment && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Update
                  </button>
                )}
              </div>
              <Badge variant={getPaymentStatusVariant(order.payment.status)} size="lg">
                {order.payment.status.charAt(0).toUpperCase() + order.payment.status.slice(1)}
              </Badge>
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Order Items ({order.items.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {order.items.map((item, index) => (
                <div key={index} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {isPopulatedOrderProduct(item.product)
                        ? item.product.name
                        : 'Product'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatCurrency(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(item.total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Information */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.customer.name}
                  </p>
                </div>
              </div>
              {order.customer.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {formatPhoneDisplay(order.customer.phone)}
                    </p>
                  </div>
                </div>
              )}
              {order.customer.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {order.customer.email}
                    </p>
                  </div>
                </div>
              )}
              {order.customer.address && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {order.customer.address}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Summary & Meta */}
        <div className="space-y-6">
          {/* Order Summary */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Order Summary
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  Tax ({order.tax.rate}%)
                </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.tax.amount)}
                </span>
              </div>
              {order.discount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Discount</span>
                  <span className="text-red-600 dark:text-red-400">
                    -{formatCurrency(order.discount)}
                  </span>
                </div>
              )}
              <hr className="border-gray-200 dark:border-gray-700" />
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Total</span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Payment Details
              </h3>
              {canUpdatePayment && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  <CreditCard className="w-4 h-4 inline mr-1" />
                  Update
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Method</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {getPaymentMethodLabel(order.payment.method)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Amount Paid</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.payment.amountPaid)}
                </span>
              </div>
              {order.payment.change > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Change</span>
                  <span className="text-green-600 dark:text-green-400">
                    {formatCurrency(order.payment.change)}
                  </span>
                </div>
              )}
              {order.payment.status !== 'paid' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Balance Due</span>
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {formatCurrency(Math.max(0, order.total - order.payment.amountPaid))}
                  </span>
                </div>
              )}
              {order.payment.paidAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Paid At</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {formatDate(order.payment.paidAt)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Order Meta */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Order Information
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Hash className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Order Number</p>
                  <p className="font-mono font-medium text-gray-900 dark:text-gray-100">
                    {order.orderNumber}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Branch</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {isPopulatedOrderBranch(order.branch) ? order.branch.name : '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Created</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              {isPopulatedOrderUser(order.processedBy) && (
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Processed By</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {order.processedBy.firstName} {order.processedBy.lastName}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <UpdateStatusModal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        order={order}
      />

      <UpdatePaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        order={order}
      />
    </div>
  );
}
