'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Wrench,
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
  Car,
  Package,
  Clock,
} from 'lucide-react';
import { useServiceOrder } from '@/hooks/useServices';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
  AssignMechanicModal,
  UpdateServiceStatusModal,
  UpdatePartsModal,
  UpdateServicePaymentModal,
} from '@/components/services';
import {
  ServiceStatus,
  ServicePaymentStatus,
  ServicePriority,
  VALID_SERVICE_STATUS_TRANSITIONS,
  isPopulatedServiceBranch,
  isPopulatedServiceUser,
} from '@/types/service';

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
 * Get payment status badge variant
 */
function getPaymentStatusVariant(status: ServicePaymentStatus): 'secondary' | 'warning' | 'success' {
  const variants: Record<ServicePaymentStatus, 'secondary' | 'warning' | 'success'> = {
    pending: 'secondary',
    partial: 'warning',
    paid: 'success',
  };
  return variants[status] || 'secondary';
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
 * Get payment method label
 */
function getPaymentMethodLabel(method: string | undefined): string {
  if (!method) return 'Not set';
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
 * Get payment status label
 */
function getPaymentStatusLabel(status: ServicePaymentStatus): string {
  const labels: Record<ServicePaymentStatus, string> = {
    pending: 'Unpaid',
    partial: 'Partial',
    paid: 'Paid',
  };
  return labels[status] || status;
}

/**
 * Service Order Detail Page
 *
 * Shows full details of a service order with ability to update
 * status, parts, and payment information.
 */
export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Fetch service order data
  const { data: order, isLoading, error, refetch } = useServiceOrder(orderId);

  // Check if status can be updated
  const canUpdateStatus = useMemo(() => {
    if (!order) return false;
    return (VALID_SERVICE_STATUS_TRANSITIONS[order.status] || []).length > 0;
  }, [order]);

  // Check if parts can be updated
  const canUpdateParts = useMemo(() => {
    if (!order) return false;
    return order.status !== 'completed' && order.status !== 'cancelled';
  }, [order]);

  // Check if payment can be updated
  const canUpdatePayment = useMemo(() => {
    if (!order) return false;
    return order.status !== 'cancelled';
  }, [order]);

  // Check if mechanic can be assigned
  const canAssignMechanic = useMemo(() => {
    if (!order) return false;
    return order.status !== 'completed' && order.status !== 'cancelled';
  }, [order]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-500">Loading service order details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="error">
          Failed to load service order: {error.message}
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
        <Alert variant="error">Service order not found.</Alert>
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
            onClick={() => router.push('/services')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
              <Wrench className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Service Order
              </h1>
              <p className="text-sm font-mono text-gray-500 dark:text-gray-400">
                {order.jobNumber}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Link href={`/services/${orderId}/invoice`}>
            <Button variant="secondary">
              <FileText className="w-4 h-4 mr-2" />
              Invoice
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Service Status */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
                {canUpdateStatus && (
                  <button
                    onClick={() => setShowStatusModal(true)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Update
                  </button>
                )}
              </div>
              <Badge variant={getStatusVariant(order.status)} size="lg">
                {getStatusLabel(order.status)}
              </Badge>
            </div>

            {/* Priority */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <span className="text-sm text-gray-500 dark:text-gray-400 block mb-2">Priority</span>
              <Badge variant={getPriorityVariant(order.priority)} size="lg">
                {getPriorityLabel(order.priority)}
              </Badge>
            </div>

            {/* Assigned Mechanic */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Mechanic</span>
                {canAssignMechanic && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    {isPopulatedServiceUser(order.assignedTo) ? 'Change' : 'Assign'}
                  </button>
                )}
              </div>
              {isPopulatedServiceUser(order.assignedTo) ? (
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {order.assignedTo.firstName} {order.assignedTo.lastName}
                </span>
              ) : (
                <span className="text-sm text-gray-400">Unassigned</span>
              )}
            </div>

            {/* Payment Status */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Payment</span>
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
                {getPaymentStatusLabel(order.payment.status)}
              </Badge>
            </div>
          </div>

          {/* Service Description */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Service Description
            </h3>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {order.description}
            </p>
            {order.diagnosis && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Diagnosis
                </h4>
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {order.diagnosis}
                </p>
              </div>
            )}
            {order.notes && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes
                </h4>
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {order.notes}
                </p>
              </div>
            )}
          </div>

          {/* Parts Used */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-400" />
                Parts Used ({order.partsUsed.length})
              </h3>
              {canUpdateParts && (
                <button
                  onClick={() => setShowPartsModal(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  Manage Parts
                </button>
              )}
            </div>
            {order.partsUsed.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No parts added yet</p>
                {canUpdateParts && (
                  <button
                    onClick={() => setShowPartsModal(true)}
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    Add Parts
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {order.partsUsed.map((part, index) => (
                  <div key={index} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {part.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        SKU: {part.sku} • {formatCurrency(part.unitPrice)} × {part.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(part.total)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Information */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400" />
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.customer?.name || 'Unknown Customer'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.customer?.phone || 'N/A'}
                  </p>
                </div>
              </div>
              {order.customer?.email && (
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
              {order.customer?.address && (
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

          {/* Vehicle Information */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Car className="w-5 h-5 text-gray-400" />
              Vehicle Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {order.vehicle?.make && (
                <div>
                  <p className="text-sm text-gray-500">Make</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.vehicle.make}
                  </p>
                </div>
              )}
              {order.vehicle?.model && (
                <div>
                  <p className="text-sm text-gray-500">Model</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.vehicle.model}
                  </p>
                </div>
              )}
              {order.vehicle?.year && (
                <div>
                  <p className="text-sm text-gray-500">Year</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.vehicle.year}
                  </p>
                </div>
              )}
              {order.vehicle?.plateNumber && (
                <div>
                  <p className="text-sm text-gray-500">Plate Number</p>
                  <p className="font-mono font-medium text-gray-900 dark:text-gray-100">
                    {order.vehicle.plateNumber}
                  </p>
                </div>
              )}
              {order.vehicle?.vin && (
                <div>
                  <p className="text-sm text-gray-500">VIN</p>
                  <p className="font-mono text-sm text-gray-900 dark:text-gray-100">
                    {order.vehicle.vin}
                  </p>
                </div>
              )}
              {order.vehicle?.mileage && (
                <div>
                  <p className="text-sm text-gray-500">Mileage</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.vehicle.mileage.toLocaleString()} km
                  </p>
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
              Charges Summary
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Parts Total</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.totalParts)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Labor Cost</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.laborCost)}
                </span>
              </div>
              {order.otherCharges > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Other Charges</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {formatCurrency(order.otherCharges)}
                  </span>
                </div>
              )}
              <hr className="border-gray-200 dark:border-gray-700" />
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Total
                </span>
                <span className="text-xl font-bold text-orange-600 dark:text-orange-400">
                  {formatCurrency(order.totalAmount)}
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
              {order.payment.status !== 'paid' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Balance Due</span>
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {formatCurrency(Math.max(0, order.totalAmount - order.payment.amountPaid))}
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

          {/* Timeline */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              Timeline
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Created</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              {order.scheduledAt && (
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-sm text-gray-500">Scheduled</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatDate(order.scheduledAt)}
                    </p>
                  </div>
                </div>
              )}
              {order.startedAt && (
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-yellow-400" />
                  <div>
                    <p className="text-sm text-gray-500">Started</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatDate(order.startedAt)}
                    </p>
                  </div>
                </div>
              )}
              {order.completedAt && (
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-sm text-gray-500">Completed</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatDate(order.completedAt)}
                    </p>
                  </div>
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
                  <p className="text-sm text-gray-500">Job Number</p>
                  <p className="font-mono font-medium text-gray-900 dark:text-gray-100">
                    {order.jobNumber}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Branch</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {isPopulatedServiceBranch(order.branch) ? order.branch.name : '-'}
                  </p>
                </div>
              </div>
              {isPopulatedServiceUser(order.createdBy) && (
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Created By</p>
                    <p className="text-gray-900 dark:text-gray-100">
                      {order.createdBy.firstName} {order.createdBy.lastName}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AssignMechanicModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        order={order}
      />

      <UpdateServiceStatusModal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        order={order}
      />

      <UpdatePartsModal
        isOpen={showPartsModal}
        onClose={() => setShowPartsModal(false)}
        order={order}
      />

      <UpdateServicePaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        order={order}
      />
    </div>
  );
}
