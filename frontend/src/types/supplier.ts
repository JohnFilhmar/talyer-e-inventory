/**
 * Supplier types for Frontend Phase 4
 * Matches backend Supplier model schema
 */

/**
 * Payment terms options
 */
export const PAYMENT_TERMS = [
  { value: 'COD', label: 'Cash on Delivery (COD)' },
  { value: 'Net 7', label: 'Net 7 Days' },
  { value: 'Net 15', label: 'Net 15 Days' },
  { value: 'Net 30', label: 'Net 30 Days' },
  { value: 'Net 60', label: 'Net 60 Days' },
  { value: 'Net 90', label: 'Net 90 Days' },
  { value: 'Custom', label: 'Custom Terms' },
] as const;

export type PaymentTerm = (typeof PAYMENT_TERMS)[number]['value'];

/**
 * Supplier contact info (nested in backend model)
 */
export interface SupplierContact {
  personName?: string;
  phone?: string;
  email?: string;
  website?: string;
}

/**
 * Supplier address (nested in backend model)
 */
export interface SupplierAddress {
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Main Supplier interface
 * Matches backend Supplier model with nested contact and address
 */
export interface Supplier {
  _id: string;
  name: string;
  code?: string;
  contact?: SupplierContact;
  address?: SupplierAddress;
  paymentTerms?: PaymentTerm;
  creditLimit?: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Helper to get display-friendly address string
 */
export function formatSupplierAddress(address?: SupplierAddress): string {
  if (!address) return '';
  const parts = [
    address.street,
    address.city,
    address.province,
    address.postalCode,
    address.country,
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * Create supplier payload (matches backend expected format)
 */
export interface CreateSupplierPayload {
  name: string;
  code?: string;
  contact?: SupplierContact;
  address?: SupplierAddress;
  paymentTerms?: PaymentTerm;
  creditLimit?: number;
  notes?: string;
  isActive?: boolean;
}

/**
 * Update supplier payload (all fields optional)
 */
export interface UpdateSupplierPayload {
  name?: string;
  code?: string;
  contact?: SupplierContact;
  address?: SupplierAddress;
  paymentTerms?: PaymentTerm;
  creditLimit?: number;
  notes?: string;
  isActive?: boolean;
}

/**
 * Supplier list query parameters
 */
export interface SupplierListParams {
  active?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Supplier for dropdown selection
 */
export interface SupplierOption {
  _id: string;
  name: string;
  code?: string;
}
