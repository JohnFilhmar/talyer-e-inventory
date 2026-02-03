module.exports = {
  // User Roles
  USER_ROLES: {
    ADMIN: 'admin',
    SALESPERSON: 'salesperson',
    MECHANIC: 'mechanic',
    CUSTOMER: 'customer'
  },

  // Order Status
  ORDER_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Service Order Status
  SERVICE_STATUS: {
    PENDING: 'pending',
    SCHEDULED: 'scheduled',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Payment Methods
  PAYMENT_METHODS: {
    CASH: 'cash',
    CARD: 'card',
    GCASH: 'gcash',
    PAYMAYA: 'paymaya',
    BANK_TRANSFER: 'bank-transfer'
  },

  // Payment Status
  PAYMENT_STATUS: {
    PENDING: 'pending',
    PARTIAL: 'partial',
    PAID: 'paid',
    REFUNDED: 'refunded'
  },

  // Stock Transfer Status
  STOCK_TRANSFER_STATUS: {
    PENDING: 'pending',
    IN_TRANSIT: 'in-transit',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Service Priority
  SERVICE_PRIORITY: {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent'
  },

  // Notification Types
  NOTIFICATION_TYPES: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    SUCCESS: 'success'
  },

  // Notification Categories
  NOTIFICATION_CATEGORIES: {
    STOCK: 'stock',
    ORDER: 'order',
    TRANSFER: 'transfer',
    SYSTEM: 'system'
  },

  // Expense Categories
  EXPENSE_CATEGORIES: {
    RENT: 'rent',
    UTILITIES: 'utilities',
    SALARIES: 'salaries',
    SUPPLIES: 'supplies',
    MAINTENANCE: 'maintenance',
    OTHER: 'other'
  },

  // Transaction Types
  TRANSACTION_TYPES: {
    SALE: 'sale',
    REFUND: 'refund',
    EXPENSE: 'expense',
    TRANSFER: 'transfer'
  },

  // Cache TTL (Time To Live in seconds)
  CACHE_TTL: {
    SHORT: 300,        // 5 minutes
    MEDIUM: 1800,      // 30 minutes
    LONG: 3600,        // 1 hour
    VERY_LONG: 86400   // 24 hours
  },

  // Pagination
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },

  // File Upload
  UPLOAD: {
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
    ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/png']
  },

  // CORS Configuration
  CORS: {
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
};
