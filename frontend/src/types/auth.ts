/**
 * User roles matching backend User model
 */
export type UserRole = 'admin' | 'salesperson' | 'mechanic' | 'customer';

/**
 * A branch as it arrives on `User`, which is not one shape.
 *
 * `login` and `refresh-token` return the raw ObjectId string; `getMe` runs
 * `.populate('branch', 'name code')` and returns an object. `initialize()`
 * calls `getProfile()` on every cold load, so after a reload the field is
 * populated while the type said `string`.
 */
export type UserBranch = string | { _id: string; name: string; code: string };

/**
 * User interface matching backend User model
 */
export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  branch?: UserBranch;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The branch id, from either shape.
 *
 * Three pages already hand-rolled this `typeof` check, which was the evidence
 * that the drift was real; `BranchProvider`, `roleGuard` and `hasBranchAccess`
 * did not, so after a reload they compared an object to a string, always got
 * false, and issued fetches against `/branches/[object Object]`. Branch-scoped
 * UI then failed closed for the rest of the session.
 */
export function resolveBranchId(branch: UserBranch | null | undefined): string | undefined {
  if (!branch) return undefined;
  return typeof branch === 'string' ? branch : branch._id;
}

/**
 * Login request payload
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login response from backend
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string; // Backend sets httpOnly cookie, but also returns for reference
  user: User;
}

/**
 * Register request payload (for staff - admin use)
 */
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  branch?: string;
}

/**
 * Customer register request payload (for public registration)
 */
export interface CustomerRegisterRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/**
 * Forgot password request
 */
export interface ForgotPasswordRequest {
  email: string;
}

/**
 * Reset password request
 */
export interface ResetPasswordRequest {
  // Must stay `resetToken`: that is the name the backend validator
  // (authRoutes.js) and controller both read. Sending `token` made every reset
  // fail its validation chain, which is what made password reset impossible.
  resetToken: string;
  newPassword: string;
}

/**
 * Refresh token response
 */
export interface RefreshTokenResponse {
  accessToken: string;
  user?: User;
}
