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
let refreshErrorSubscribers: ((error: unknown) => void)[] = [];

/**
 * Subscribe to token refresh completion. `onError` fires instead of
 * `onSuccess` if the in-flight refresh fails (network error or a real 401),
 * so a queued request settles either way instead of hanging forever.
 */
const subscribeTokenRefresh = (
  onSuccess: (token: string) => void,
  onError: (error: unknown) => void
): void => {
  refreshSubscribers.push(onSuccess);
  refreshErrorSubscribers.push(onError);
};

/**
 * Notify all subscribers when token is refreshed
 */
const onTokenRefreshed = (token: string): void => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
  refreshErrorSubscribers = [];
};

/**
 * Notify all queued subscribers that the refresh attempt failed, so they
 * reject instead of waiting on a resolution that will never arrive.
 */
const onTokenRefreshFailed = (error: unknown): void => {
  refreshErrorSubscribers.forEach((callback) => callback(error));
  refreshSubscribers = [];
  refreshErrorSubscribers = [];
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
 * True when a request failed because the network was unreachable rather than
 * because the server rejected it. Axios reports these with no `response` and
 * a code of ERR_NETWORK (or ECONNABORTED on timeout). Treating them as auth
 * failures is what previously logged users out on a wifi drop.
 */
export const isNetworkError = (error: unknown): boolean => {
  const axiosError = error as AxiosError;
  if (!axiosError || typeof axiosError !== 'object') return false;
  if (axiosError.response) return false;
  return (
    axiosError.code === 'ERR_NETWORK' ||
    axiosError.code === 'ECONNABORTED' ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
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
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh(
            (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(apiClient(originalRequest));
            },
            (err: unknown) => reject(err)
          );
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
        // A network failure is not an authentication failure. Keep the tokens
        // and the session so the app can keep serving cached data offline;
        // the request itself still rejects and the caller falls back.
        if (!isNetworkError(refreshError)) {
          clearTokens();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        // Settle any requests queued behind this refresh attempt - they
        // would otherwise wait forever on a token that is never coming.
        onTokenRefreshFailed(refreshError);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
