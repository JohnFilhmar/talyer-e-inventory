/**
 * Service Order types for Frontend Phase 6
 * Matches backend ServiceOrder model schema
 */

// ============ Constants ============

/**
 * Service order status options
 */
export const SERVICE_STATUS = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type ServiceStatus = (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

export const SERVICE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'gray' },
  { value: 'scheduled', label: 'Scheduled', color: 'blue' },
  { value: 'in-progress', label: 'In Progress', color: 'yellow' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'cancelled', label: 'Cancelled', color: 'red' },
] as const;

/**
 * Priority levels
 */
export const SERVICE_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type ServicePriority = (typeof SERVICE_PRIORITY)[keyof typeof SERVICE_PRIORITY];

export const SERVICE_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'gray' },
  { value: 'normal', label: 'Normal', color: 'blue' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'urgent', label: 'Urgent', color: 'red' },
] as const;

/**
 * Payment status options (matches backend - no refunded for services)
 */
export const SERVICE_PAYMENT_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
} as const;

export type ServicePaymentStatus = (typeof SERVICE_PAYMENT_STATUS)[keyof typeof SERVICE_PAYMENT_STATUS];

export const SERVICE_PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Unpaid', color: 'gray' },
  { value: 'partial', label: 'Partial', color: 'yellow' },
  { value: 'paid', label: 'Paid', color: 'green' },
] as const;

/**
 * Payment method options (same as sales)
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
 * Valid status transitions for service orders
 */
export const VALID_SERVICE_STATUS_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  pending: ['scheduled', 'cancelled'],
  scheduled: ['in-progress', 'cancelled'],
  'in-progress': ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// ============ Interfaces ============

/**
 * Customer information embedded in service order
 */
export interface ServiceCustomer {
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

/**
 * Vehicle information
 */
export interface ServiceVehicle {
  make?: string;
  model?: string;
  year?: number;
  plateNumber?: string;
  vin?: string;
  mileage?: number;
}

/**
 * Part used in service
 */
export interface PartUsed {
  _id?: string;
  product: PartProduct | string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * Populated product reference in parts used
 */
export interface PartProduct {
  _id: string;
  sku: string;
  name: string;
  brand?: string;
  images?: Array<{ url: string; isPrimary: boolean }>;
}

/**
 * Payment information for service order
 */
export interface ServicePayment {
  method?: PaymentMethod;
  amountPaid: number;
  status: ServicePaymentStatus;
  paidAt?: string;
}

/**
 * User reference in service order (mechanic or creator)
 */
export interface ServiceUser {
  _id: string;
  firstName: string;
  lastName: string;
  name?: string;
  email?: string;
  role?: string;
}

/**
 * Branch reference in service order
 */
export interface ServiceBranch {
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
 * Main ServiceOrder interface
 */
export interface ServiceOrder {
  _id: string;
  jobNumber: string;
  branch: ServiceBranch | string;
  customer: ServiceCustomer;
  vehicle: ServiceVehicle;
  assignedTo?: ServiceUser | string;
  description: string;
  diagnosis?: string;
  partsUsed: PartUsed[];
  laborCost: number;
  otherCharges: number;
  totalParts: number;
  totalAmount: number;
  priority: ServicePriority;
  status: ServiceStatus;
  payment: ServicePayment;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: ServiceUser | string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============ Request Payloads ============

/**
 * Create service order payload
 */
export interface CreateServiceOrderPayload {
  branch: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  vehicle: {
    make?: string;
    model?: string;
    year?: number;
    plateNumber?: string;
    vin?: string;
    mileage?: number;
  };
  assignedTo?: string;
  description: string;
  diagnosis?: string;
  laborCost?: number;
  otherCharges?: number;
  priority?: ServicePriority;
  scheduledAt?: string;
  notes?: string;
}

/**
 * Assign mechanic payload
 */
export interface AssignMechanicPayload {
  mechanicId: string;
}

/**
 * Update service status payload
 */
export interface UpdateServiceStatusPayload {
  status: ServiceStatus;
}

/**
 * Part item for update parts payload
 */
export interface PartItemPayload {
  product: string;
  quantity: number;
}

/**
 * Update parts payload
 */
export interface UpdatePartsPayload {
  partsUsed: PartItemPayload[];
}

/**
 * Update payment payload
 */
export interface UpdateServicePaymentPayload {
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
}

/**
 * Update labor/charges payload
 */
export interface UpdateChargesPayload {
  laborCost?: number;
  otherCharges?: number;
  diagnosis?: string;
}

// ============ Query Parameters ============

/**
 * Service order list query parameters
 */
export interface ServiceOrderListParams {
  branch?: string;
  status?: ServiceStatus;
  priority?: ServicePriority;
  paymentStatus?: ServicePaymentStatus;
  assignedTo?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * My jobs query parameters (for mechanics)
 */
export interface MyJobsParams {
  status?: ServiceStatus;
  priority?: ServicePriority;
  page?: number;
  limit?: number;
}

// ============ Stats ============

/**
 * Service statistics (calculated client-side)
 */
export interface ServiceStats {
  totalJobs: number;
  inProgressJobs: number;
  scheduledJobs: number;
  todayRevenue: number;
  completedThisWeek?: number;
}

// ============ Type Guards ============

export function isPopulatedServiceBranch(branch: ServiceBranch | string): branch is ServiceBranch {
  return typeof branch === 'object' && branch !== null && '_id' in branch;
}

export function isPopulatedServiceUser(user: ServiceUser | string | undefined): user is ServiceUser {
  return typeof user === 'object' && user !== null && '_id' in user;
}

export function isPopulatedPartProduct(product: PartProduct | string): product is PartProduct {
  return typeof product === 'object' && product !== null && '_id' in product;
}

// ============ Helpers ============

/**
 * Get status badge color class
 */
export function getServiceStatusColor(status: ServiceStatus): string {
  const option = SERVICE_STATUS_OPTIONS.find((o) => o.value === status);
  return option?.color ?? 'gray';
}

/**
 * Get status label
 */
export function getServiceStatusLabel(status: ServiceStatus): string {
  const option = SERVICE_STATUS_OPTIONS.find((o) => o.value === status);
  return option?.label ?? status;
}

/**
 * Get priority badge color class
 */
export function getPriorityColor(priority: ServicePriority): string {
  const option = SERVICE_PRIORITY_OPTIONS.find((o) => o.value === priority);
  return option?.color ?? 'gray';
}

/**
 * Get priority label
 */
export function getPriorityLabel(priority: ServicePriority): string {
  const option = SERVICE_PRIORITY_OPTIONS.find((o) => o.value === priority);
  return option?.label ?? priority;
}

/**
 * Get payment status badge color
 */
export function getServicePaymentStatusColor(status: ServicePaymentStatus): string {
  const option = SERVICE_PAYMENT_STATUS_OPTIONS.find((o) => o.value === status);
  return option?.color ?? 'gray';
}

/**
 * Get payment method label
 */
export function getPaymentMethodLabel(method?: PaymentMethod): string {
  if (!method) return 'Not set';
  const option = PAYMENT_METHOD_OPTIONS.find((o) => o.value === method);
  return option?.label ?? method;
}

/**
 * Get valid next statuses for current status
 */
export function getValidNextServiceStatuses(currentStatus: ServiceStatus): ServiceStatus[] {
  return VALID_SERVICE_STATUS_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Check if status transition is valid
 */
export function isValidServiceStatusTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return VALID_SERVICE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Format phone number for display (09XXXXXXXXX → 09XX XXX XXXX)
 */
export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return '';
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
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) {
    return `0${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('09')) {
    return digits;
  }
  return digits;
}

/**
 * Calculate service totals
 */
export function calculateServiceTotals(
  partsUsed: Array<{ quantity: number; unitPrice: number }>,
  laborCost: number = 0,
  otherCharges: number = 0
): { totalParts: number; totalAmount: number } {
  const totalParts = partsUsed.reduce(
    (sum, part) => sum + part.quantity * part.unitPrice,
    0
  );
  const totalAmount = totalParts + laborCost + otherCharges;
  return { totalParts, totalAmount };
}

/**
 * Format currency in Philippine Peso
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(dateString?: string): string {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
  }).format(new Date(dateString));
}

/**
 * Format datetime for display
 */
export function formatDateTime(dateString?: string): string {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

/**
 * Get mechanic display name
 */
export function getMechanicName(assignedTo?: ServiceUser | string): string {
  if (!assignedTo) return 'Unassigned';
  if (typeof assignedTo === 'string') return 'Loading...';
  return assignedTo.name || `${assignedTo.firstName} ${assignedTo.lastName}`;
}

/**
 * Get vehicle display string
 */
export function getVehicleDisplay(vehicle: ServiceVehicle): string {
  const parts: string[] = [];
  if (vehicle.year) parts.push(String(vehicle.year));
  if (vehicle.make) parts.push(vehicle.make);
  if (vehicle.model) parts.push(vehicle.model);
  if (parts.length === 0 && vehicle.plateNumber) {
    return vehicle.plateNumber;
  }
  return parts.join(' ') || 'N/A';
}

/**
 * Check if user can update service status
 */
export function canUpdateServiceStatus(
  currentStatus: ServiceStatus,
  userRole: string,
  isAssigned: boolean
): boolean {
  // Cannot update terminal states
  if (currentStatus === 'completed' || currentStatus === 'cancelled') {
    return false;
  }
  // Admin can always update
  if (userRole === 'admin') return true;
  // Mechanic can only update if assigned
  if (userRole === 'mechanic') return isAssigned;
  // Salesperson can update
  if (userRole === 'salesperson') return true;
  return false;
}

/**
 * Check if user can update parts
 */
export function canUpdateParts(
  currentStatus: ServiceStatus,
  userRole: string,
  isAssigned: boolean
): boolean {
  // Can only update parts for non-terminal statuses
  const allowedStatuses: ServiceStatus[] = ['pending', 'scheduled', 'in-progress'];
  if (!allowedStatuses.includes(currentStatus)) {
    return false;
  }
  // Admin can always update
  if (userRole === 'admin') return true;
  // Mechanic can only update if assigned
  if (userRole === 'mechanic') return isAssigned;
  return false;
}

/**
 * Calculate stats from service orders list
 */
export function calculateServiceStats(orders: ServiceOrder[]): ServiceStats {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  return {
    totalJobs: orders.length,
    inProgressJobs: orders.filter((o) => o.status === 'in-progress').length,
    scheduledJobs: orders.filter((o) => o.status === 'scheduled').length,
    todayRevenue: orders
      .filter(
        (o) =>
          o.status === 'completed' &&
          o.payment.status === 'paid' &&
          o.completedAt &&
          new Date(o.completedAt) >= todayStart
      )
      .reduce((sum, o) => sum + o.totalAmount, 0),
    completedThisWeek: orders.filter(
      (o) =>
        o.status === 'completed' &&
        o.completedAt &&
        new Date(o.completedAt) >= weekStart
    ).length,
  };
}
