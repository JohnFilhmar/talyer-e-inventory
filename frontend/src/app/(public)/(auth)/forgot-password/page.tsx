'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { authService } from '@/lib/services/authService';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/utils/validators/auth';

/**
 * Forgot password page component
 * 
 * Features:
 * - Email input for password reset request
 * - Success message on email sent
 * - Error handling
 * - Link back to login
 */
export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string>('');

  // Clear messages on unmount
  useEffect(() => {
    return () => {
      setError(null);
      setSuccess(false);
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.forgotPassword({ email: data.email });

      if (response.success) {
        setSubmittedEmail(data.email);
        setSuccess(true);
      } else {
        setError(response.message || 'Failed to send reset email');
      }
    } catch (err: unknown) {
      const message = err instanceof Error 
        ? (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message || err.message
        : 'An unexpected error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-10 h-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-black">Check your email</h2>
          <p className="text-gray-600">
            We have sent a password reset link to{' '}
            <span className="font-medium text-black">{submittedEmail}</span>
          </p>
          <p className="text-sm text-gray-500">
            Did not receive the email? Check your spam folder or{' '}
            <button
              onClick={() => setSuccess(false)}
              className="text-yellow-600 hover:text-yellow-500 font-medium"
            >
              try again
            </button>
          </p>
          <div className="pt-4">
            <Link
              href="/login"
              className="text-yellow-600 hover:text-yellow-500 font-medium"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center">
              <svg
                className="w-10 h-10 text-black"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-black">Forgot password?</h2>
          <p className="mt-2 text-sm text-gray-600">
            No worries, we will send you reset instructions.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Forgot Password Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isLoading}
            size="lg"
          >
            Send reset link
          </Button>
        </form>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <Link href="/login" className="hover:text-yellow-600">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
