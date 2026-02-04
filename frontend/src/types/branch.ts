import type { User } from './auth';

/**
 * Branch address structure
 */
export interface BranchAddress {
  street: string;
  city: string;
  province: string;
  postalCode?: string;
  country?: string;
}

/**
 * Branch contact information
 */
export interface BranchContact {
  phone: string;
  email?: string;
  fax?: string;
}

/**
 * Business hours for a single day
 */
export interface BusinessHours {
  open?: string;
  close?: string;
}

/**
 * Weekly business hours
 */
export interface WeeklyBusinessHours {
  monday?: BusinessHours;
  tuesday?: BusinessHours;
  wednesday?: BusinessHours;
  thursday?: BusinessHours;
  friday?: BusinessHours;
  saturday?: BusinessHours;
  sunday?: BusinessHours;
}

/**
 * Branch settings configuration
 */
export interface BranchSettings {
  taxRate?: number;
  currency?: 'PHP' | 'USD' | 'EUR';
  timezone?: string;
  businessHours?: WeeklyBusinessHours;
  allowNegativeStock?: boolean;
  lowStockThreshold?: number;
}

/**
 * Branch manager - can be populated User or just ID string
 */
export interface BranchManager {
  _id: string;
  name: string;
  email: string;
  role?: string;
}

/**
 * Main Branch interface matching backend model
 */
export interface Branch {
  _id: string;
  id?: string;
  name: string;
  code: string;
  address: BranchAddress;
  contact: BranchContact;
  manager?: BranchManager | string;
  settings: BranchSettings;
  isActive: boolean;
  description?: string;
  staffCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Branch statistics from /branches/:id/stats
 */
export interface BranchStats {
  branch: {
    id: string;
    name: string;
    code: string;
  };
  staff: {
    total: number;
    active: number;
    inactive: number;
  };
  inventory: {
    totalProducts: number;
    lowStockItems: number;
  };
  sales: {
    totalOrders: number;
    totalRevenue: number;
  };
}

/**
 * Payload for creating a new branch
 */
export interface CreateBranchPayload {
  name: string;
  code: string;
  address: BranchAddress;
  contact: BranchContact;
  manager?: string;
  settings?: Partial<BranchSettings>;
  description?: string;
}

/**
 * Payload for updating a branch
 */
export interface UpdateBranchPayload {
  name?: string;
  code?: string;
  address?: Partial<BranchAddress>;
  contact?: Partial<BranchContact>;
  manager?: string | null;
  settings?: Partial<BranchSettings>;
  isActive?: boolean;
  description?: string;
}

/**
 * Query parameters for branch list endpoint
 */
export interface BranchListParams {
  active?: string;
  city?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Manager option for dropdown selection
 */
export interface ManagerOption {
  _id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * User list response for managers dropdown
 */
export type ManagerListResponse = Pick<User, '_id' | 'name' | 'email' | 'role'>[];
