import { create } from 'zustand';
import type { User } from '@/types/auth';
import { authService } from '@/lib/services/authService';
import { clearTokens } from '@/lib/tokenStorage';

/**
 * Auth store state interface
 */
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

/**
 * Auth store actions interface
 */
interface AuthActions {
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  registerCustomer: (name: string, email: string, password: string, phone?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export type AuthStore = AuthState & AuthActions;

/**
 * Zustand auth store
 * Manages authentication state across the application
 */
export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  error: null,

  // Actions
  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },

  /**
   * Login user
   * Returns true on success, false on failure
   */
  login: async (email, password) => {
    const { setUser, setLoading, setError } = get();
    
    setLoading(true);
    setError(null);

    try {
      const response = await authService.login({ email, password });

      if (response.success && response.data) {
        setUser(response.data.user);
        return true;
      } else {
        setError(response.message || 'Login failed');
        return false;
      }
    } catch (error: unknown) {
      const message = error instanceof Error 
        ? (error as Error & { response?: { data?: { message?: string } } }).response?.data?.message || error.message
        : 'An unexpected error occurred';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  },

  /**
   * Register new customer account
   * Returns true on success, false on failure
   */
  registerCustomer: async (name, email, password, phone?) => {
    const { setUser, setLoading, setError } = get();

    setLoading(true);
    setError(null);

    try {
      const response = await authService.registerCustomer({ 
        name, 
        email, 
        password,
        phone
      });

      if (response.success && response.data) {
        setUser(response.data.user);
        return true;
      } else {
        setError(response.message || 'Registration failed');
        return false;
      }
    } catch (error: unknown) {
      const message = error instanceof Error 
        ? (error as Error & { response?: { data?: { message?: string } } }).response?.data?.message || error.message
        : 'An unexpected error occurred';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  },

  /**
   * Logout user
   */
  logout: async () => {
    const { setUser, setLoading } = get();

    setLoading(true);

    try {
      await authService.logout();
    } finally {
      clearTokens();
      setUser(null);
      setLoading(false);
    }
  },

  /**
   * Initialize auth state on app load
   * Attempts to restore session using refresh token (httpOnly cookie)
   */
  initialize: async () => {
    const { setUser, setLoading } = get();

    // Skip if already initialized
    if (get().isInitialized) return;

    setLoading(true);

    try {
      // Try to refresh token (backend reads httpOnly cookie and returns user data)
      const refreshResponse = await authService.refreshToken();

      if (refreshResponse.success && refreshResponse.data?.accessToken) {
        // Token refreshed successfully, user data is included in response
        if (refreshResponse.data.user) {
          setUser(refreshResponse.data.user);
        } else {
          // Fallback: fetch user profile if not included
          const profileResponse = await authService.getProfile();
          if (profileResponse.success && profileResponse.data) {
            setUser(profileResponse.data);
          }
        }
      }
    } catch {
      // No valid session, user needs to login
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
      set({ isInitialized: true });
    }
  },
}));

/**
 * Selector hooks for specific state slices
 */
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useAuthInitialized = () => useAuthStore((state) => state.isInitialized);
