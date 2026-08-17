'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

interface ToastAction {
  label: string;
  href: string;
}

interface ToastOptions {
  variant?: 'success' | 'error';
  action?: ToastAction;
}

interface ToastRecord extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

/**
 * Transient confirmations for actions whose result is off-screen.
 *
 * Deliberately additive: every mutation still surfaces its own failure through
 * the page's `Alert`. A toast is never the only place an error appears, because
 * it is gone in five seconds.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, ...options }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      );
    },
    [dismiss]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Full width at the bottom on a phone, a stack in the corner from sm up.
          A tablet on the shop counter is the primary device. */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              toast.variant === 'error'
                ? 'flex items-start gap-3 rounded-lg border-2 border-black bg-black px-4 py-3 shadow-lg'
                : 'flex items-start gap-3 rounded-lg border-2 border-yellow-400 bg-white dark:bg-gray-900 px-4 py-3 shadow-lg'
            }
          >
            <p
              className={
                toast.variant === 'error'
                  ? 'flex-1 text-sm font-medium text-red-500 dark:text-red-400'
                  : 'flex-1 text-sm font-medium text-black dark:text-gray-100'
              }
            >
              {toast.message}
            </p>

            {toast.action && (
              <Link
                href={toast.action.href}
                onClick={() => dismiss(toast.id)}
                className={
                  toast.variant === 'error'
                    ? 'shrink-0 text-sm font-semibold text-white underline'
                    : 'shrink-0 text-sm font-semibold text-black dark:text-gray-100 underline'
                }
              >
                {toast.action.label}
              </Link>
            )}

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className={
                toast.variant === 'error'
                  ? 'shrink-0 text-gray-400 hover:text-white'
                  : 'shrink-0 text-gray-400 hover:text-black dark:hover:text-gray-100'
              }
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
}
