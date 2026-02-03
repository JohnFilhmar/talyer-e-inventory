'use client';

import React, { useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { useSalesOrder } from '@/hooks/useSales';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
  formatPhoneDisplay,
  isPopulatedOrderBranch,
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
 * Format date for invoice
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date with time
 */
function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
 * Invoice Page
 *
 * Print-friendly invoice view for a sales order.
 */
export default function InvoicePage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch order data
  const { data: order, isLoading, error } = useSalesOrder(orderId);

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-500">Loading invoice...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="error">
          Failed to load invoice: {error.message}
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

  const branchName = isPopulatedOrderBranch(order.branch) ? order.branch.name : 'Branch';
  const branchCode = isPopulatedOrderBranch(order.branch) ? order.branch.code : '';

  return (
    <>
      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Action Bar - Hidden on print */}
      <div className="no-print p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/sales/${orderId}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Order
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="print-area bg-white min-h-screen">
        <div ref={printRef} className="max-w-4xl mx-auto p-8">
          {/* Header */}
          <div className="border-b-2 border-gray-900 pb-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">INVOICE</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Talyer-E Inventory System
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xl font-bold text-gray-900">
                  {order.orderNumber}
                </p>
                <p className="text-sm text-gray-600">
                  Date: {formatDate(order.createdAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Branch & Customer Info */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* From (Branch) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">From</h3>
              <p className="font-semibold text-gray-900">{branchName}</p>
              {branchCode && (
                <p className="text-sm text-gray-600">Branch Code: {branchCode}</p>
              )}
            </div>

            {/* Bill To (Customer) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To</h3>
              <p className="font-semibold text-gray-900">{order.customer.name}</p>
              {order.customer.phone && (
                <p className="text-sm text-gray-600">
                  Phone: {formatPhoneDisplay(order.customer.phone)}
                </p>
              )}
              {order.customer.email && (
                <p className="text-sm text-gray-600">Email: {order.customer.email}</p>
              )}
              {order.customer.address && (
                <p className="text-sm text-gray-600">{order.customer.address}</p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="py-3 text-left text-sm font-semibold text-gray-700">#</th>
                  <th className="py-3 text-left text-sm font-semibold text-gray-700">Item</th>
                  <th className="py-3 text-center text-sm font-semibold text-gray-700">Qty</th>
                  <th className="py-3 text-right text-sm font-semibold text-gray-700">Unit Price</th>
                  <th className="py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-3 text-sm text-gray-600">{index + 1}</td>
                    <td className="py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {isPopulatedOrderProduct(item.product)
                          ? item.product.name
                          : 'Product'}
                      </p>
                      {isPopulatedOrderProduct(item.product) && (
                        <p className="text-xs text-gray-500">
                          SKU: {item.product.sku}
                        </p>
                      )}
                    </td>
                    <td className="py-3 text-sm text-center text-gray-900">{item.quantity}</td>
                    <td className="py-3 text-sm text-right text-gray-900">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 text-sm text-right font-medium text-gray-900">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex justify-end mb-8">
            <div className="w-80">
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-gray-900">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-600">Tax ({order.tax.rate}%)</span>
                <span className="text-gray-900">{formatCurrency(order.tax.amount)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="text-red-600">-{formatCurrency(order.discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-3 border-t-2 border-gray-900 mt-2">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Method</p>
                <p className="font-medium text-gray-900">
                  {getPaymentMethodLabel(order.payment.method)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Amount Paid</p>
                <p className="font-medium text-gray-900">
                  {formatCurrency(order.payment.amountPaid)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className={`font-medium ${
                  order.payment.status === 'paid'
                    ? 'text-green-600'
                    : order.payment.status === 'partial'
                    ? 'text-yellow-600'
                    : 'text-gray-900'
                }`}>
                  {order.payment.status.charAt(0).toUpperCase() + order.payment.status.slice(1)}
                </p>
              </div>
              {order.payment.change > 0 && (
                <div>
                  <p className="text-gray-500">Change</p>
                  <p className="font-medium text-gray-900">
                    {formatCurrency(order.payment.change)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-6 text-center text-sm text-gray-500">
            <p>Thank you for your business!</p>
            <p className="mt-2">
              Generated on {formatDateTime(new Date().toISOString())}
            </p>
            {order.status === 'completed' && order.payment.status === 'paid' && (
              <p className="mt-2 text-green-600 font-medium">
                ✓ PAID IN FULL
              </p>
            )}
            {order.status === 'cancelled' && (
              <p className="mt-2 text-red-600 font-medium">
                ✗ ORDER CANCELLED
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
