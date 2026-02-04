import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setAccessToken, clearTokens } from './tokenStorage';
import type { ApiResponse } from '@/types/api';
import type { RefreshTokenResponse } from '@/types/auth';

/**
 * Axios instance configured for the backend API
 * 
 * Features:
 * - Automatic Authorization header attachment
 * - 401 response handling with token refresh
 * - Credentials included for httpOnly cookie support
 */
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for httpOnly cookies
});

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

/**
 * Subscribe to token refresh completion
 */
const subscribeTokenRefresh = (callback: (token: string) => void): void => {
  refreshSubscribers.push(callback);
};

/**
 * Notify all subscribers when token is refreshed
 */
const onTokenRefreshed = (token: string): void => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

/**
 * Request interceptor: Attach access token to all requests
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Auth endpoints that should NOT trigger token refresh on 401
 * These endpoints return 401 for invalid credentials, not expired tokens
 */
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/register-customer',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/reset-password',
];

/**
 * Check if request URL is an auth endpoint
 */
const isAuthEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));
};

/**
 * Response interceptor: Handle 401 errors with token refresh, and 403 for deactivated users
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 403 for deactivated users
    if (error.response?.status === 403) {
      const errorMessage = error.response.data?.message || '';
      
      // Check if user was deactivated
      if (errorMessage.toLowerCase().includes('deactivated') || 
          errorMessage.toLowerCase().includes('account has been disabled')) {
        clearTokens();
        
        // Redirect to login with message
        if (typeof window !== 'undefined') {
          window.location.href = '/login?error=account_deactivated';
        }
        
        return Promise.reject(error);
      }
    }

    // Skip token refresh for auth endpoints - 401 means invalid credentials, not expired token
    if (isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    // If 401 and not already retrying, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // Call refresh endpoint - backend reads httpOnly cookie
        const { data } = await axios.post<ApiResponse<RefreshTokenResponse>>(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/auth/refresh-token`,
          {},
          { withCredentials: true }
        );

        if (data.success && data.data?.accessToken) {
          const newToken = data.data.accessToken;
          setAccessToken(newToken);
          onTokenRefreshed(newToken);

          // Retry original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed - clear tokens and redirect to login
        clearTokens();
        
        // Only redirect if we're in browser context
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
