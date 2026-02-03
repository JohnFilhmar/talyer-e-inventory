'use client';

import { Spinner } from "@/components/ui";
import { Suspense } from "react";
import LoginForm from "./login";

/**
 * Login page component
 * 
 * Features:
 * - Email/password authentication
 * - Form validation with Zod
 * - Error handling and display
 * - Redirect to intended destination after login
 * - Link to register and forgot password
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Spinner size="lg" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
