export const USER_ROLES = {
  ADMIN: 'admin',
  SALESPERSON: 'salesperson',
  MECHANIC: 'mechanic',
  CUSTOMER: 'customer'
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const SERVICE_STATUS = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  GCASH: 'gcash',
  PAYMAYA: 'paymaya',
  BANK_TRANSFER: 'bank-transfer'
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  REFUNDED: 'refunded'
};

export const STOCK_TRANSFER_STATUS = {
  PENDING: 'pending',
  IN_TRANSIT: 'in-transit',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const SERVICE_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent'
};

export const NOTIFICATION_TYPES = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success'
};

export const NOTIFICATION_CATEGORIES = {
  STOCK: 'stock',
  ORDER: 'order',
  TRANSFER: 'transfer',
  SYSTEM: 'system'
};

export const EXPENSE_CATEGORIES = {
  RENT: 'rent',
  UTILITIES: 'utilities',
  SALARIES: 'salaries',
  SUPPLIES: 'supplies',
  MAINTENANCE: 'maintenance',
  OTHER: 'other'
};

export const TRANSACTION_TYPES = {
  SALE: 'sale',
  REFUND: 'refund',
  EXPENSE: 'expense',
  TRANSFER: 'transfer'
};

export const CACHE_TTL = {
  SHORT: 300,        // 5 minutes
  MEDIUM: 1800,      // 30 minutes
  LONG: 3600,        // 1 hour
  VERY_LONG: 86400   // 24 hours
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

export const UPLOAD = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/png']
};

export const CORS = {
  ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS 
    ? process.env.CORS_ALLOWED_ORIGINS.split(',')
    : [process.env.CLIENT_URL || 'http://localhost:3000'],
  ALLOWED_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  ALLOWED_HEADERS: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Refresh-Token'
  ],
  EXPOSED_HEADERS: ['X-Total-Count', 'X-Total-Pages'],
  CREDENTIALS: true,
  MAX_AGE: 86400 // 24 hours
}