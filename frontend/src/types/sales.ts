/**
 * Sales Order types for Frontend Phase 5
 * Matches backend SalesOrder model schema
 */

// ============ Constants ============

/**
 * Order status options
 */
export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'gray' },
  { value: 'processing', label: 'Processing', color: 'yellow' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'cancelled', label: 'Cancelled', color: 'red' },
] as const;

/**
 * Payment status options
 */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  REFUNDED: 'refunded',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Unpaid', color: 'gray' },
  { value: 'partial', label: 'Partial', color: 'yellow' },
  { value: 'paid', label: 'Paid', color: 'green' },
  { value: 'refunded', label: 'Refunded', color: 'red' },
] as const;

/**
 * Payment method options (matches backend exactly)
 */
export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  GCASH: 'gcash',
  PAYMAYA: 'paymaya',
  BANK_TRANSFER: 'bank-transfer',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'gcash', label: 'GCash' },
  { value: 'paymaya', label: 'PayMaya' },
  { value: 'bank-transfer', label: 'Bank Transfer' },
] as const;

/**
 * Valid status transitions
 */
export const VALID_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// ============ Interfaces ============

/**
 * Customer information embedded in order
 */
export interface OrderCustomer {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

/**
 * Order item (line item)
 */
export interface OrderItem {
  _id: string;
  product: OrderProduct | string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

/**
 * Populated product reference in order item
 */
export interface OrderProduct {
  _id: string;
  sku: string;
  name: string;
  brand?: string;
  images?: Array<{ url: string; isPrimary: boolean }>;
}

/**
 * Tax information
 */
export interface OrderTax {
  rate: number;
  amount: number;
}

/**
 * Payment information
 */
export interface OrderPayment {
  method: PaymentMethod;
  amountPaid: number;
  change: number;
  status: PaymentStatus;
  paidAt?: string;
}

/**
 * User reference in order
 */
export interface OrderUser {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

/**
 * Branch reference in order
 */
export interface OrderBranch {
  _id: string;
  name: string;
  code: string;
  address?: {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  contact?: {
    phone?: string;
    email?: string;
  };
}

/**
 * Main SalesOrder interface
 */
export interface SalesOrder {
  _id: string;
  orderNumber: string;
  branch: OrderBranch | string;
  customer: OrderCustomer;
  items: OrderItem[];
  subtotal: number;
  tax: OrderTax;
  discount: number;
  total: number;
  payment: OrderPayment;
  status: OrderStatus;
  processedBy: OrderUser | string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============ Request Payloads ============

/**
 * Create order item payload
 */
export interface CreateOrderItemPayload {
  product: string;
  quantity: number;
  discount?: number;
}

/**
 * Create sales order payload
 */
export interface CreateSalesOrderPayload {
  branch: string;
  customer: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  items: CreateOrderItemPayload[];
  taxRate?: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  amountPaid?: number;
  notes?: string;
}

/**
 * Update order status payload
 */
export interface UpdateOrderStatusPayload {
  status: OrderStatus;
}

/**
 * Update payment payload
 */
export interface UpdatePaymentPayload {
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
}

// ============ Query Parameters ============

/**
 * Sales order list query parameters
 */
export interface SalesOrderListParams {
  branch?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Alias for SalesOrderListParams for use as filters
 */
export type SalesOrderFilters = SalesOrderListParams;

// ============ Stats ============

/**
 * Sales statistics response
 */
export interface SalesStats {
  totalOrders: number;
  pendingOrders: number;
  todayRevenue: number;
  monthRevenue: number;
  completedOrders?: number;
  cancelledOrders?: number;
}

// ============ Invoice ============

/**
 * Invoice data for printing
 */
export interface InvoiceData {
  order: SalesOrder;
  company: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
  };
}

// ============ Type Guards ============

export function isPopulatedOrderBranch(branch: OrderBranch | string): branch is OrderBranch {
  return typeof branch === 'object' && '_id' in branch;
}

export function isPopulatedOrderProduct(product: OrderProduct | string): product is OrderProduct {
  return typeof product === 'object' && '_id' in product;
}

export function isPopulatedOrderUser(user: OrderUser | string): user is OrderUser {
  return typeof user === 'object' && '_id' in user;
}

// ============ Helpers ============

/**
 * Get status badge color
 */
export function getOrderStatusColor(status: OrderStatus): string {
  const option = ORDER_STATUS_OPTIONS.find((o) => o.value === status);
  return option?.color ?? 'gray';
}

/**
 * Get payment status badge color
 */
export function getPaymentStatusColor(status: PaymentStatus): string {
  const option = PAYMENT_STATUS_OPTIONS.find((o) => o.value === status);
  return option?.color ?? 'gray';
}

/**
 * Get payment method label
 */
export function getPaymentMethodLabel(method: PaymentMethod): string {
  const option = PAYMENT_METHOD_OPTIONS.find((o) => o.value === method);
  return option?.label ?? method;
}

/**
 * Get valid next statuses for current status
 */
export function getValidNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Check if status transition is valid
 */
export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Format phone number for display (09XXXXXXXXX → 09XX XXX XXXX)
 */
export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return '';
  // Remove any non-digit characters
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

/**
 * Normalize phone input (9XXXXXXXXX → 09XXXXXXXXX)
 */
export function normalizePhoneNumber(input: string): string {
  // Remove any non-digit characters
  const digits = input.replace(/\D/g, '');
  // If starts with 9 and has 10 digits, prepend 0
  if (digits.length === 10 && digits.startsWith('9')) {
    return `0${digits}`;
  }
  // If already has 11 digits starting with 09, return as is
  if (digits.length === 11 && digits.startsWith('09')) {
    return digits;
  }
  return digits;
}

/**
 * Calculate order item total
 */
export function calculateItemTotal(quantity: number, unitPrice: number, discount: number = 0): number {
  return quantity * unitPrice - discount;
}

/**
 * Calculate order totals
 */
export function calculateOrderTotals(
  items: Array<{ quantity: number; unitPrice: number; discount?: number }>,
  taxRate: number = 0,
  orderDiscount: number = 0
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + calculateItemTotal(item.quantity, item.unitPrice, item.discount ?? 0),
    0
  );
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount - orderDiscount;
  return { subtotal, taxAmount, total: Math.max(0, total) };
}
