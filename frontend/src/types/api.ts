/**
 * One entry of the `errors` array a validation failure returns.
 *
 * The shape is set by backend/src/middleware/validate.js, which maps
 * express-validator's result to `{ field, message, value }`. This type
 * previously declared `Record<string, string[]>`, which no endpoint has ever
 * sent; nothing read the field, so the drift went unnoticed until the reset
 * page needed to render it.
 */
export interface ApiFieldError {
  field: string;
  message: string;
}

/**
 * Standard API response format matching backend ApiResponse utility
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ApiFieldError[];
  pagination?: PaginationInfo;
  meta?: Record<string, unknown>;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination?: PaginationInfo;
}

/**
 * API error structure for consistent error handling
 */
export interface ApiError {
  message: string;
  errors?: ApiFieldError[];
  statusCode?: number;
}
