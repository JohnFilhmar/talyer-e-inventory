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

/**
 * Exactly what `ApiResponse.paginate` emits, and nothing more.
 *
 * `hasNextPage` and `hasPrevPage` used to be declared here and have never been
 * sent by any endpoint. Typed as `boolean` rather than `boolean | undefined`,
 * `if (pagination.hasNextPage)` compiled cleanly and was always false, which is
 * precisely the shape a paging bug ships in. Derive them instead.
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** True when a further page exists. Derived, because the API does not send it. */
export const hasNextPage = (pagination: PaginationInfo): boolean =>
  pagination.page < pagination.pages;

/** True when an earlier page exists. */
export const hasPrevPage = (pagination: PaginationInfo): boolean =>
  pagination.page > 1;

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
