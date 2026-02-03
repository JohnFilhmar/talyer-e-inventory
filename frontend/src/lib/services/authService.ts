import apiClient from '@/lib/apiClient';
import { setAccessToken, clearTokens } from '@/lib/tokenStorage';
import type { ApiResponse } from '@/types/api';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  CustomerRegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  RefreshTokenResponse,
  User,
} from '@/types/auth';

/**
 * Authentication service
 * Handles all auth-related API calls
 */
export const authService = {
  /**
   * Login user with email and password
   */
  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/login',
      credentials
    );

    // Store access token in memory on successful login
    if (data.success && data.data?.accessToken) {
      setAccessToken(data.data.accessToken);
    }

    return data;
  },

  /**
   * Register a new user (staff - admin use)
   */
  async register(userData: RegisterRequest): Promise<ApiResponse<LoginResponse>> {
    const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/register',
      userData
    );

    // Store access token in memory on successful registration
    if (data.success && data.data?.accessToken) {
      setAccessToken(data.data.accessToken);
    }

    return data;
  },

  /**
   * Register a new customer account (public registration)
   */
  async registerCustomer(userData: CustomerRegisterRequest): Promise<ApiResponse<LoginResponse>> {
    const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/register-customer',
      userData
    );

    // Store access token in memory on successful registration
    if (data.success && data.data?.accessToken) {
      setAccessToken(data.data.accessToken);
    }

    return data;
  },

  /**
   * Logout current user
   * Clears tokens and calls backend logout endpoint to invalidate refresh token cookie
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      // Always clear tokens even if logout request fails
      clearTokens();
    }
  },

  /**
   * Request password reset email
   */
  async forgotPassword(data: ForgotPasswordRequest): Promise<ApiResponse> {
    const response = await apiClient.post<ApiResponse>(
      '/api/auth/forgot-password',
      data
    );
    return response.data;
  },

  /**
   * Reset password using token from email
   */
  async resetPassword(data: ResetPasswordRequest): Promise<ApiResponse> {
    const response = await apiClient.post<ApiResponse>(
      '/api/auth/reset-password',
      data
    );
    return response.data;
  },

  /**
   * Refresh access token
   * Backend reads httpOnly cookie and returns new access token
   */
  async refreshToken(): Promise<ApiResponse<RefreshTokenResponse>> {
    const { data } = await apiClient.post<ApiResponse<RefreshTokenResponse>>(
      '/api/auth/refresh-token'
    );

    if (data.success && data.data?.accessToken) {
      setAccessToken(data.data.accessToken);
    }

    return data;
  },

  /**
   * Get current user profile
   */
  async getProfile(): Promise<ApiResponse<User>> {
    const { data } = await apiClient.get<ApiResponse<User>>('/api/auth/me');
    return data;
  },

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
    const { data } = await apiClient.post<ApiResponse>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return data;
  },
};
