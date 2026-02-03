import { z } from 'zod';
import type { UserRole } from '@/types/user';

/**
 * Roles that require branch assignment
 */
const rolesRequiringBranch: UserRole[] = ['salesperson', 'mechanic'];

/**
 * Password validation regex - matches backend requirements
 * At least one uppercase, one lowercase, and one number
 */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

/**
 * Create user form validation schema
 */
export const createUserSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters')
    .regex(
      passwordRegex,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: z
    .string()
    .min(1, 'Please confirm the password'),
  role: z.enum(['admin', 'salesperson', 'mechanic', 'customer'], {
    message: 'Please select a valid role',
  }),
  branch: z
    .string()
    .optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
}).refine((data) => {
  // Branch is required for salesperson and mechanic roles
  if (rolesRequiringBranch.includes(data.role as UserRole)) {
    return !!data.branch && data.branch.trim() !== '';
  }
  return true;
}, {
  message: 'Branch is required for this role',
  path: ['branch'],
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;

/**
 * Update user form validation schema
 * Note: Password is handled separately via changePassword endpoint
 * Note: isActive is handled separately via deactivate/activate endpoints
 */
export const updateUserSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  role: z.enum(['admin', 'salesperson', 'mechanic', 'customer'], {
    message: 'Please select a valid role',
  }),
  branch: z
    .string()
    .nullable()
    .optional(),
}).refine((data) => {
  // Branch is required for salesperson and mechanic roles
  if (rolesRequiringBranch.includes(data.role as UserRole)) {
    return !!data.branch && data.branch.trim() !== '';
  }
  return true;
}, {
  message: 'Branch is required for this role',
  path: ['branch'],
});

export type UpdateUserFormData = z.infer<typeof updateUserSchema>;

/**
 * Change password form validation schema (admin resetting user password)
 */
export const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters')
    .regex(
      passwordRegex,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: z
    .string()
    .min(1, 'Please confirm the password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

/**
 * Helper to check if role requires branch
 */
export function roleRequiresBranch(role: UserRole): boolean {
  return rolesRequiringBranch.includes(role);
}
