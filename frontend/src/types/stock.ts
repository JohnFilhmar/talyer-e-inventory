/**
 * Stock types for Frontend Phase 4
 * Matches backend Stock and StockTransfer model schemas
 */

import type { ProductCategory } from './product';

/**
 * Stock record - represents inventory of a product at a specific branch
 * Unique constraint: (product + branch) combination
 */
export interface Stock {
  _id: string;
  product: StockProduct | string;
  branch: StockBranch | string;
  quantity: number;
  reservedQuantity: number;
  reorderPoint: number;
  reorderQuantity: number;
  costPrice: number;
  sellingPrice: number;
  supplier?: StockSupplier | string;
  location?: string;
  lastRestocked?: string;
  lastRestockedBy?: string;
  createdAt: string;
  updatedAt: string;
  /** Virtual field - quantity - reservedQuantity */
  available: number;
  /** Virtual field - quantity <= reorderPoint */
  isLowStock: boolean;
}

/**
 * Populated product reference in stock
 */
export interface StockProduct {
  _id: string;
  name: string;
  sku: string;
  category?: ProductCategory;
  images?: Array<{ url: string; isPrimary: boolean }>;
  primaryImage?: string;
}

/**
 * Populated branch reference in stock
 */
export interface StockBranch {
  _id: string;
  name: string;
  code: string;
}

/**
 * Populated supplier reference in stock
 */
export interface StockSupplier {
  _id: string;
  name: string;
  code?: string;
}

/**
 * Stock transfer between branches
 */
export interface StockTransfer {
  _id: string;
  transferNumber: string;
  product: StockProduct | string;
  fromBranch: StockBranch | string;
  toBranch: StockBranch | string;
  quantity: number;
  status: TransferStatus;
  requestedBy: TransferUser | string;
  shippedBy?: TransferUser | string;
  completedBy?: TransferUser | string;
  shippedAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transfer status enum
 */
export type TransferStatus = 'pending' | 'in-transit' | 'completed' | 'cancelled';

/**
 * User reference in transfer
 */
export interface TransferUser {
  _id: string;
  firstName: string;
  lastName: string;
}

/**
 * Restock request payload (for creating/updating stock by product+branch)
 */
export interface RestockPayload {
  product: string;
  branch: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  supplier?: string;
  location?: string;
}

/**
 * Restock by ID payload (for restocking existing stock record)
 * Note: Does NOT include price - just adds quantity to existing stock
 */
export interface RestockByIdPayload {
  quantity: number;
  supplierId?: string;
  notes?: string;
}

/**
 * Adjust stock request payload (for adjusting by product+branch)
 */
export interface AdjustStockPayload {
  product: string;
  branch: string;
  adjustment: number;
  reason: string;
}

/**
 * Adjust stock by ID payload (for adjusting existing stock record)
 */
export interface AdjustStockByIdPayload {
  quantity: number; // Can be positive or negative
  reason: string;
  notes?: string;
}

/**
 * Create transfer request payload
 */
export interface CreateTransferPayload {
  product: string;
  fromBranch: string;
  toBranch: string;
  quantity: number;
  notes?: string;
}

/**
 * Update transfer status payload
 */
export interface UpdateTransferStatusPayload {
  status: TransferStatus;
}

/**
 * Stock list query parameters
 */
export interface StockListParams {
  branch?: string;
  product?: string;
  lowStock?: string;
  outOfStock?: string;
  page?: number;
  limit?: number;
}

/**
 * Transfer list query parameters
 */
export interface TransferListParams {
  branch?: string;
  status?: TransferStatus;
  page?: number;
  limit?: number;
}

/**
 * Stock by product response (cross-branch summary)
 */
export interface ProductStockSummary {
  product: StockProduct;
  branches: Array<{
    branch: StockBranch;
    quantity: number;
    reservedQuantity: number;
    available: number;
    costPrice: number;
    sellingPrice: number;
    reorderPoint: number;
    isLowStock: boolean;
  }>;
  totalQuantity: number;
  totalAvailable: number;
}

/**
 * Adjustment reasons enum
 */
export const ADJUSTMENT_REASONS = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
  { value: 'found', label: 'Found' },
  { value: 'inventory_count', label: 'Inventory Count' },
  { value: 'returned', label: 'Returned' },
  { value: 'expired', label: 'Expired' },
  { value: 'other', label: 'Other' },
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]['value'];

/**
 * Transfer status options for UI
 */
export const TRANSFER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'gray' },
  { value: 'in-transit', label: 'In Transit', color: 'yellow' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'cancelled', label: 'Cancelled', color: 'red' },
] as const;

/**
 * Valid status transitions
 */
export const VALID_STATUS_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  'pending': ['in-transit', 'cancelled'],
  'in-transit': ['completed', 'cancelled'],
  'completed': [],
  'cancelled': [],
};

/**
 * Type guards
 */
export function isPopulatedStockProduct(product: StockProduct | string): product is StockProduct {
  return typeof product === 'object' && '_id' in product;
}

export function isPopulatedStockBranch(branch: StockBranch | string): branch is StockBranch {
  return typeof branch === 'object' && '_id' in branch;
}

export function isPopulatedSupplier(supplier: StockSupplier | string | undefined): supplier is StockSupplier {
  return supplier !== undefined && typeof supplier === 'object' && '_id' in supplier;
}

export function isPopulatedTransferUser(user: TransferUser | string | undefined): user is TransferUser {
  return user !== undefined && typeof user === 'object' && '_id' in user;
}

// ============ Stock Movement Types ============

/**
 * Stock movement types - all the ways stock quantity can change
 */
export const MOVEMENT_TYPES = {
  restock: 'restock',
  adjustment_add: 'adjustment_add',
  adjustment_remove: 'adjustment_remove',
  sale: 'sale',
  sale_cancel: 'sale_cancel',
  service_use: 'service_use',
  transfer_out: 'transfer_out',
  transfer_in: 'transfer_in',
  initial: 'initial',
} as const;

export type MovementType = (typeof MOVEMENT_TYPES)[keyof typeof MOVEMENT_TYPES];

/**
 * Movement type display configuration
 */
export const MOVEMENT_TYPE_CONFIG: Record<MovementType, {
  label: string;
  color: 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'yellow' | 'gray';
  icon: 'plus' | 'minus' | 'package' | 'cart' | 'x' | 'wrench' | 'arrow-right' | 'arrow-left' | 'box';
}> = {
  restock: { label: 'Restock', color: 'green', icon: 'package' },
  adjustment_add: { label: 'Adjustment (+)', color: 'blue', icon: 'plus' },
  adjustment_remove: { label: 'Adjustment (-)', color: 'orange', icon: 'minus' },
  sale: { label: 'Sale', color: 'purple', icon: 'cart' },
  sale_cancel: { label: 'Sale Cancelled', color: 'gray', icon: 'x' },
  service_use: { label: 'Service Parts', color: 'yellow', icon: 'wrench' },
  transfer_out: { label: 'Transfer Out', color: 'red', icon: 'arrow-right' },
  transfer_in: { label: 'Transfer In', color: 'green', icon: 'arrow-left' },
  initial: { label: 'Initial Stock', color: 'gray', icon: 'box' },
};

/**
 * User reference in movement
 */
export interface MovementUser {
  _id: string;
  name: string;
  email?: string;
}

/**
 * Stock movement record - tracks all stock quantity changes
 */
export interface StockMovement {
  _id: string;
  movementId: string;
  stock: string;
  product: StockProduct | string;
  branch: StockBranch | string;
  type: MovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason?: string;
  reference?: {
    type: 'SalesOrder' | 'ServiceOrder' | 'StockTransfer';
    id: string;
  };
  supplier?: StockSupplier | string;
  performedBy: MovementUser | string;
  notes?: string;
  createdAt: string;
  /** Virtual field - formatted quantity with +/- sign */
  quantityDisplay?: string;
}

/**
 * Query params for movement list
 */
export interface MovementListParams {
  type?: MovementType;
  branch?: string;
  product?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

/**
 * Type guard for populated movement user
 */
export function isPopulatedMovementUser(user: MovementUser | string): user is MovementUser {
  return typeof user === 'object' && '_id' in user;
}
