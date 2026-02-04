# Frontend Phase 1: Authentication & User Management

**Aligned with Backend:** Phase 1 (Auth & User Management)  
**Complexity:** Medium  
**Priority:** Critical (Foundation)  
**Estimated Effort:** 3-5 days  
**Status:** ✅ COMPLETED - See [Frontend-Phase-1-done.md](Frontend-Phase-1-done.md) for implementation details

---

## Overview

Phase 1 establishes the authentication and authorization foundation for the entire application. This phase implements user login, registration, token management, role-based access control, and protected routing. All subsequent phases depend on this authentication layer.

**Core Features:**
- User login and registration
- JWT token management (access + refresh)
- Role-based route protection (admin, salesperson, mechanic, customer)
- User profile management
- Password reset flow
- Logout functionality

---

## Prerequisites

Before starting this phase:
- [x] Review [Frontend-Guidelines.md](Frontend-Guidelines.md) for design system and security requirements
- [x] Set up Next.js project with TailwindCSS configured
- [x] Configure environment variables (`NEXT_PUBLIC_API_URL`)
- [x] Install dependencies: `axios`, `zod`, `react-hook-form`, `zustand` (or your state management choice)
- [x] Review backend Phase 1 documentation and test cases

---

## Part A: UI/Pages Design (Build First)

### 1. Login Page (`app/(auth)/login/page.tsx`)

**Layout:**
- Centered card on white background (max-w-md)
- Logo/app name at top (yellow accent)
- Email and password input fields
- "Remember me" checkbox (optional for MVP)
- "Login" button (yellow background, black text)
- "Forgot password?" link below button
- "Don't have an account? Register" link at bottom

**Responsive Design:**
- Mobile: Full-width card with padding
- Desktop: Centered card (400px width)

**Validation:**
- Email: Required, valid email format
- Password: Required, minimum 6 characters
- Show field-level errors in red text below inputs

**States:**
- Default: Empty form
- Loading: Disabled inputs, spinner on button
- Error: Display error message in red alert box above form
- Success: Redirect to dashboard

**Component Structure:**
```typescript
// app/(auth)/login/page.tsx
- LoginPage (container)
  - LoginForm (form with validation)
    - Input (email)
    - Input (password)
    - Button (submit)
    - Link (forgot password)
    - Link (register)
```

---

### 2. Register Page (`app/(auth)/register/page.tsx`)

**Layout:**
- Similar to login page
- Additional fields: Name, Confirm Password
- Role selection dropdown (admin can set, others default to 'customer')
- Branch selection dropdown (for non-admin users, optional if admin creates users)
- "Register" button (yellow background, black text)
- "Already have an account? Login" link at bottom

**Responsive Design:**
- Mobile: Stacked fields
- Desktop: Two-column layout for name/email, password/confirm password

**Validation:**
- Name: Required, 2-50 characters
- Email: Required, valid email format, check uniqueness (backend will validate)
- Password: Required, minimum 6 characters, complexity rules
- Confirm Password: Must match password
- Role: Optional, default 'customer' (admins can set this in user management)
- Branch: Required for non-admin roles

**States:**
- Default, Loading, Error, Success (same as login)

**Component Structure:**
```typescript
// app/(auth)/register/page.tsx
- RegisterPage (container)
  - RegisterForm (form with validation)
    - Input (name)
    - Input (email)
    - Input (password)
    - Input (confirm password)
    - Select (role) — hidden for non-admin
    - Select (branch) — conditional
    - Button (submit)
    - Link (login)
```

---

### 3. Forgot Password Page (`app/(auth)/forgot-password/page.tsx`)

**Layout:**
- Centered card
- Email input field
- "Send Reset Link" button (yellow background, black text)
- "Back to Login" link

**Responsive Design:**
- Same as login page

**Validation:**
- Email: Required, valid email format

**States:**
- Default: Empty form
- Loading: Disabled input, spinner on button
- Success: Show success message "Reset link sent to your email"
- Error: Display error message

**Component Structure:**
```typescript
// app/(auth)/forgot-password/page.tsx
- ForgotPasswordPage (container)
  - ForgotPasswordForm (form with validation)
    - Input (email)
    - Button (submit)
    - Link (back to login)
```

---

### 4. Reset Password Page (`app/(auth)/reset-password/page.tsx`)

**Layout:**
- Centered card
- New password input field
- Confirm new password input field
- "Reset Password" button (yellow background, black text)
- Token extracted from URL query parameter

**Responsive Design:**
- Same as login page

**Validation:**
- New Password: Required, minimum 6 characters
- Confirm Password: Must match new password

**States:**
- Default: Empty form
- Loading: Disabled inputs, spinner on button
- Success: Show success message, redirect to login
- Error: Display error message (invalid/expired token)

**Component Structure:**
```typescript
// app/(auth)/reset-password/page.tsx
- ResetPasswordPage (container)
  - ResetPasswordForm (form with validation)
    - Input (new password)
    - Input (confirm password)
    - Button (submit)
```

---

### 5. Protected Layout (`app/(protected)/layout.tsx`)

**Layout:**
- Top navbar: Logo, navigation links, user menu (dropdown)
- Main content area: Render child pages
- Sidebar (optional): Navigation menu for main sections

**Navbar Components:**
- **Logo/App Name:** Left side, links to dashboard
- **Navigation Links:** Center/left
  - Dashboard
  - Branches (admin only)
  - Products
  - Stock
  - Suppliers
  - Sales
  - Services
- **User Menu:** Right side (dropdown)
  - User name and role
  - Profile (future)
  - Logout

**Responsive Design:**
- Mobile: Hamburger menu (black icon), full-screen slide-in menu
- Desktop: Horizontal navbar with links

**Authorization:**
- Show/hide navigation links based on user role
- Example: "Branches" link only for admins
- Mechanics see only "Services > My Jobs"

**Component Structure:**
```typescript
// app/(protected)/layout.tsx
- ProtectedLayout (wrapper with auth guard)
  - Navbar
    - Logo
    - NavLinks (filtered by role)
    - UserMenu
      - UserAvatar
      - Dropdown
        - ProfileLink
        - LogoutButton
  - MainContent (children)
```

---

### 6. Dashboard Page (`app/(protected)/dashboard/page.tsx`)

**Layout:**
- Welcome message: "Welcome, [User Name]"
- Role-specific quick stats (cards)
  - Admin: Total branches, products, orders, revenue
  - Salesperson: Today's sales, pending orders, low stock items
  - Mechanic: Assigned jobs, pending jobs, completed jobs
- Quick action buttons (yellow background, black text)
  - Admin: "Add Branch", "Add Product"
  - Salesperson: "New Sale", "View Stock"
  - Mechanic: "My Jobs"

**Responsive Design:**
- Mobile: Stacked cards (1 column)
- Tablet: 2 columns
- Desktop: 3-4 columns

**Component Structure:**
```typescript
// app/(protected)/dashboard/page.tsx
- DashboardPage (container)
  - WelcomeHeader
    - UserGreeting
  - StatsGrid (role-specific)
    - StatCard (Total Branches)
    - StatCard (Total Products)
    - StatCard (Total Orders)
    - StatCard (Revenue)
  - QuickActions
    - Button (Add Branch)
    - Button (Add Product)
    - Button (New Sale)
```

---

### 7. Profile Page (`app/(protected)/profile/page.tsx`) — Optional for MVP

**Layout:**
- User information card (read-only for MVP)
- Name, Email, Role, Branch
- "Change Password" button (future feature)

**Responsive Design:**
- Mobile: Full-width card
- Desktop: Centered card (max-w-2xl)

**Component Structure:**
```typescript
// app/(protected)/profile/page.tsx
- ProfilePage (container)
  - ProfileCard
    - UserInfo (name, email, role, branch)
    - Button (Change Password) — disabled or placeholder
```

---

## Part B: Feature Implementation (Build After UI)

### 1. Setup API Client (`lib/apiClient.ts`)

**Purpose:** Configure Axios instance with interceptors for authentication and error handling.

**Implementation:**
```typescript
import axios from 'axios';
import { getAccessToken, getRefreshToken, setAccessToken, clearTokens } from './tokenStorage';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach access token
apiClient.interceptors.request.use(
  (config) => {
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle 401, refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, attempt refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = getRefreshToken();

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh-token`, {
            refreshToken,
          });
          setAccessToken(data.data.accessToken);
          originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        clearTokens();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

**Checklist:**
- [ ] Create `apiClient.ts` with Axios instance
- [ ] Implement request interceptor to attach access token
- [ ] Implement response interceptor to handle 401 and refresh token
- [ ] Handle refresh failure: clear tokens, redirect to login
- [ ] Set timeout and base URL from environment variables

---

### 2. Token Storage (`lib/tokenStorage.ts`)

**Purpose:** Securely store and retrieve JWT tokens.

**Implementation:**
```typescript
// Store access token in memory (React state/Zustand)
let accessToken: string | null = null;

export const setAccessToken = (token: string) => {
  accessToken = token;
};

export const getAccessToken = (): string | null => {
  return accessToken;
};

// Store refresh token in localStorage (fallback, prefer httpOnly cookie)
export const setRefreshToken = (token: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('refreshToken', token);
  }
};

export const getRefreshToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('refreshToken');
  }
  return null;
};

export const clearTokens = () => {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('refreshToken');
  }
};
```

**Security Notes:**
- **Access token:** Stored in memory (not localStorage) to prevent XSS attacks
- **Refresh token:** Stored in localStorage as fallback (prefer httpOnly cookie from backend)
- **On page reload:** Use refresh token to get new access token

**Checklist:**
- [ ] Create `tokenStorage.ts` with token getters/setters
- [ ] Store access token in memory only
- [ ] Store refresh token in localStorage (or read from httpOnly cookie)
- [ ] Implement `clearTokens()` for logout

---

### 3. Auth Service (`features/auth/services/authService.ts`)

**Purpose:** Handle all authentication-related API calls.

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import { setAccessToken, setRefreshToken, clearTokens } from '@/lib/tokenStorage';
import type { ApiResponse } from '@/types/api';
import type { User, LoginRequest, LoginResponse, RegisterRequest } from '../types';

export const authService = {
  // Login
  async login(credentials: LoginRequest): Promise<User> {
    const { data } = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', credentials);
    if (data.success && data.data) {
      setAccessToken(data.data.accessToken);
      setRefreshToken(data.data.refreshToken);
      return data.data.user;
    }
    throw new Error(data.message || 'Login failed');
  },

  // Register
  async register(userData: RegisterRequest): Promise<User> {
    const { data } = await apiClient.post<ApiResponse<{ user: User }>>('/auth/register', userData);
    if (data.success && data.data) {
      return data.data.user;
    }
    throw new Error(data.message || 'Registration failed');
  },

  // Get current user
  async me(): Promise<User> {
    const { data } = await apiClient.get<ApiResponse<User>>('/auth/me');
    if (data.success && data.data) {
      return data.data;
    }
    throw new Error(data.message || 'Failed to fetch user');
  },

  // Logout
  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
    clearTokens();
  },

  // Forgot password
  async forgotPassword(email: string): Promise<void> {
    const { data } = await apiClient.post<ApiResponse<void>>('/auth/forgot-password', { email });
    if (!data.success) {
      throw new Error(data.message || 'Failed to send reset link');
    }
  },

  // Reset password
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { data } = await apiClient.post<ApiResponse<void>>('/auth/reset-password', { token, newPassword });
    if (!data.success) {
      throw new Error(data.message || 'Failed to reset password');
    }
  },
};
```

**Checklist:**
- [ ] Create `authService.ts` in `features/auth/services/`
- [ ] Implement `login()` method
- [ ] Implement `register()` method
- [ ] Implement `me()` method to fetch current user
- [ ] Implement `logout()` method
- [ ] Implement `forgotPassword()` method
- [ ] Implement `resetPassword()` method
- [ ] Handle API responses and errors consistently

---

### 4. Auth Types (`features/auth/types.ts`)

**Purpose:** Define TypeScript interfaces for authentication data.

**Implementation:**
```typescript
export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'salesperson' | 'mechanic' | 'customer';
  branch?: string; // Branch ID for non-admin users
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'salesperson' | 'mechanic' | 'customer';
  branch?: string;
}
```

**Checklist:**
- [ ] Create `types.ts` in `features/auth/`
- [ ] Define `User` interface matching backend User model
- [ ] Define `LoginRequest`, `LoginResponse`, `RegisterRequest` interfaces
- [ ] Export all types for use in components and services

---

### 5. Auth State Management (`features/auth/store/authStore.ts`)

**Purpose:** Manage global authentication state using Zustand (or Context).

**Implementation (Zustand):**
```typescript
import { create } from 'zustand';
import { authService } from '../services/authService';
import type { User, LoginRequest, RegisterRequest } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  register: (userData: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const user = await authService.login(credentials);
      set({ user, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      const user = await authService.register(userData);
      set({ isLoading: false });
      // Don't auto-login after registration in MVP
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authService.logout();
      set({ user: null, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchUser: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await authService.me();
      set({ user, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false, user: null });
    }
  },

  clearError: () => set({ error: null }),
}));
```

**Checklist:**
- [ ] Create `authStore.ts` in `features/auth/store/`
- [ ] Define `AuthState` interface with user, loading, error
- [ ] Implement `login()` action
- [ ] Implement `register()` action
- [ ] Implement `logout()` action
- [ ] Implement `fetchUser()` action for checking auth on app load
- [ ] Implement `clearError()` helper

---

### 6. Auth Hook (`features/auth/hooks/useAuth.ts`)

**Purpose:** Provide convenient access to auth state and actions in components.

**Implementation:**
```typescript
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { getRefreshToken } from '@/lib/tokenStorage';

export const useAuth = () => {
  const { user, isLoading, error, login, register, logout, fetchUser, clearError } = useAuthStore();

  // On mount, check for refresh token and fetch user if exists
  useEffect(() => {
    const refreshToken = getRefreshToken();
    if (refreshToken && !user) {
      fetchUser();
    }
  }, []);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    clearError,
  };
};
```

**Checklist:**
- [ ] Create `useAuth.ts` in `features/auth/hooks/`
- [ ] Export hook that uses `useAuthStore`
- [ ] Add `useEffect` to check for refresh token on mount and fetch user
- [ ] Return `isAuthenticated` computed property

---

### 7. Auth Guard Middleware (`middleware/authGuard.tsx`)

**Purpose:** Protect routes from unauthenticated access.

**Implementation:**
```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/hooks/useAuth';

export const withAuthGuard = (Component: React.ComponentType) => {
  return function AuthGuardedComponent(props: any) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push('/login');
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!isAuthenticated) {
      return null;
    }

    return <Component {...props} />;
  };
};
```

**Checklist:**
- [ ] Create `authGuard.tsx` in `middleware/`
- [ ] Implement `withAuthGuard` HOC
- [ ] Redirect to `/login` if not authenticated
- [ ] Show loading spinner while checking auth

---

### 8. Role Guard Middleware (`middleware/roleGuard.tsx`)

**Purpose:** Restrict access to specific routes based on user role.

**Implementation:**
```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/hooks/useAuth';

type Role = 'admin' | 'salesperson' | 'mechanic' | 'customer';

export const withRoleGuard = (Component: React.ComponentType, allowedRoles: Role[]) => {
  return function RoleGuardedComponent(props: any) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && user && !allowedRoles.includes(user.role)) {
        router.push('/dashboard'); // Redirect to dashboard if not allowed
      }
    }, [user, isLoading, router]);

    if (isLoading) {
      return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!user || !allowedRoles.includes(user.role)) {
      return <div className="flex items-center justify-center min-h-screen">Access Denied</div>;
    }

    return <Component {...props} />;
  };
};
```

**Checklist:**
- [ ] Create `roleGuard.tsx` in `middleware/`
- [ ] Implement `withRoleGuard` HOC that accepts allowed roles
- [ ] Redirect to dashboard if user role not allowed
- [ ] Show "Access Denied" message for forbidden access

---

### 9. Connect UI to Services

**Login Page:**
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      router.push('/dashboard');
    } catch (err) {
      // Error already set in store
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-md p-8 bg-white border border-gray-200 rounded shadow-sm">
        <h1 className="text-2xl font-bold text-black mb-6">Login</h1>
        {error && <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>}
        <form onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" isLoading={isLoading} className="w-full">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
```

**Protected Layout:**
```typescript
'use client';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { withAuthGuard } from '@/middleware/authGuard';
import Navbar from '@/components/layout/Navbar';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}

export default withAuthGuard(ProtectedLayout);
```

**Checklist:**
- [ ] Connect login page to `useAuth` hook
- [ ] Handle form submission, call `login()` action
- [ ] Display error messages from store
- [ ] Redirect to dashboard on success
- [ ] Implement similar patterns for register, forgot password, reset password pages
- [ ] Wrap protected layout with `withAuthGuard`

---

## Part C: Validation & Security

### Input Validation (Zod Schemas)

**Login Schema:**
```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
```

**Register Schema:**
```typescript
export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  role: z.enum(['admin', 'salesperson', 'mechanic', 'customer']).optional(),
  branch: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
```

**Checklist:**
- [ ] Create Zod schemas for login, register, forgot password, reset password
- [ ] Integrate with `react-hook-form` for client-side validation
- [ ] Display field-level errors below inputs
- [ ] Disable submit button until form is valid

---

### Security Checklist

- [ ] **Token Storage:** Access token in memory, refresh token in localStorage (or httpOnly cookie)
- [ ] **HTTPS Only:** Use HTTPS URLs in production (check `NEXT_PUBLIC_API_URL`)
- [ ] **Input Sanitization:** Trim whitespace, validate email format, check password strength
- [ ] **XSS Prevention:** Never render user input without sanitization (use React's default escaping)
- [ ] **CSRF Protection:** If backend uses CSRF tokens, include in headers
- [ ] **Rate Limiting:** Backend handles this, frontend should not bypass (no retry loops)
- [ ] **Error Messages:** Generic errors for login failures ("Invalid credentials" not "User not found")
- [ ] **Logout:** Clear all tokens and redirect to login
- [ ] **Session Timeout:** Implement auto-logout after X minutes of inactivity (optional for MVP)

---

## Part D: Testing & Validation

### Manual Testing Checklist

**Login Flow:**
- [ ] Login with valid credentials: Success, redirect to dashboard
- [ ] Login with invalid email: Show validation error
- [ ] Login with wrong password: Show "Invalid credentials" error
- [ ] Login with non-existent user: Show "Invalid credentials" error
- [ ] Check token stored in memory/localStorage
- [ ] Refresh page: User remains logged in (token refresh works)

**Register Flow:**
- [ ] Register with valid data: Success, redirect to login
- [ ] Register with existing email: Show "Email already exists" error
- [ ] Register with weak password: Show validation error
- [ ] Register with mismatched passwords: Show "Passwords do not match" error
- [ ] Register without required fields: Show field-level errors

**Protected Routes:**
- [ ] Access `/dashboard` without login: Redirect to `/login`
- [ ] Access `/dashboard` after login: Show dashboard
- [ ] Logout: Clear tokens, redirect to login
- [ ] Try accessing protected route after logout: Redirect to login

**Token Refresh:**
- [ ] Expire access token (wait or manually invalidate): Automatic refresh on next API call
- [ ] Expire refresh token: Redirect to login
- [ ] Make API call with expired token: Token refreshes, request succeeds

**Role-Based Access:**
- [ ] Admin user: Can access all routes
- [ ] Salesperson: Cannot access admin-only routes (e.g., `/branches/new`)
- [ ] Mechanic: Can only access `/services/my-jobs`
- [ ] Customer: Limited access (if applicable)

**Forgot Password:**
- [ ] Submit valid email: Show success message
- [ ] Submit invalid email: Show error
- [ ] Click reset link in email: Navigate to reset password page
- [ ] Submit new password: Success, redirect to login

**Responsive Design:**
- [ ] Test login/register on mobile (320px width)
- [ ] Test protected layout on mobile: Hamburger menu works
- [ ] Test dashboard on tablet and desktop

---

## Part E: Success Criteria

Phase 1 is complete when:
- [ ] All UI pages are built and styled per design system (yellow/black/white)
- [ ] User can register, login, and logout successfully
- [ ] Tokens are stored securely (access in memory, refresh in storage)
- [ ] Token refresh works automatically on 401 responses
- [ ] Protected routes redirect to login if not authenticated
- [ ] Role-based guards restrict access to admin-only routes
- [ ] Forgot password and reset password flows work end-to-end
- [ ] All manual tests pass
- [ ] Responsive design works on mobile, tablet, desktop
- [ ] No console errors or warnings
- [ ] Code follows TypeScript strict mode and ESLint rules

---

## Part F: Next Steps

After completing Phase 1:
1. **Proceed to Phase 2:** Branch Management (admin can create/manage branches)
2. **Refine Auth:** Add "Remember Me" functionality, session timeout (optional)
3. **User Management:** Admin can create users, assign roles and branches (future phase)
4. **Audit Logging:** Track login/logout events (future phase)

---

## Common Pitfalls

1. **Storing access token in localStorage:** Use memory to prevent XSS attacks
2. **Not handling token refresh:** Leads to forced logouts on token expiry
3. **Weak password validation:** Enforce minimum length and complexity
4. **Exposing sensitive errors:** Don't reveal "User not found" vs "Wrong password"
5. **Not testing mobile:** UI breaks on small screens
6. **Hardcoding API URL:** Use environment variables
7. **Ignoring loading states:** Users see blank screens during async operations
8. **Not clearing tokens on logout:** Users can still access protected routes

---

**End of Phase 1**

Refer to [Frontend-Guidelines.md](Frontend-Guidelines.md) for design system and [Planning.md](Planning.md) for endpoint contracts.
