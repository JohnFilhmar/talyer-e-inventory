/**
 * Token storage utilities
 * 
 * Security approach:
 * - Access token: Stored in memory only (prevents XSS attacks)
 * - Refresh token: Managed via httpOnly cookie by backend (not accessible to JS)
 * 
 * On page reload, we call the refresh endpoint which reads the httpOnly cookie
 * and returns a new access token.
 */

// In-memory storage for access token (not persisted, cleared on page refresh)
let accessToken: string | null = null;

/**
 * Set the access token in memory
 */
export const setAccessToken = (token: string): void => {
  accessToken = token;
};

/**
 * Get the access token from memory
 */
export const getAccessToken = (): string | null => {
  return accessToken;
};

/**
 * Clear the access token from memory
 * Note: Refresh token is cleared by backend (httpOnly cookie)
 */
export const clearTokens = (): void => {
  accessToken = null;
};

/**
 * Check if we have an access token in memory
 */
export const hasAccessToken = (): boolean => {
  return accessToken !== null && accessToken.length > 0;
};
