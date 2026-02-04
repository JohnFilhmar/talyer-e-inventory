/**
 * Token storage utilities
 * 
 * Security approach:
 * - Access token: Stored in localStorage for persistence across page reloads
 * - Refresh token: Managed via httpOnly cookie by backend (not accessible to JS)
 */

const ACCESS_TOKEN_KEY = 'access_token';

/**
 * Set the access token in localStorage
 */
export const setAccessToken = (token: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  }
};

/**
 * Get the access token from localStorage
 */
export const getAccessToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return null;
};

/**
 * Clear the access token from localStorage
 * Note: Refresh token is cleared by backend (httpOnly cookie)
 */
export const clearTokens = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
};

/**
 * Check if we have an access token in localStorage
 */
export const hasAccessToken = (): boolean => {
  const token = getAccessToken();
  return token !== null && token.length > 0;
};
