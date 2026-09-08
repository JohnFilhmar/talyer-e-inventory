/**
 * User roles matching backend User model
 */
export type UserRole = 'admin' | 'salesperson' | 'mechanic' | 'customer';

/**
 * User interface matching backend User model
 */
export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  branch?: string; // Branch ID for non-admin users
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
