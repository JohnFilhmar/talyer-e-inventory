'use client';

import React, { useState, useCallback } from 'react';
import { Phone } from 'lucide-react';

/**
 * Phone number regex pattern
 * Must be exactly 10 digits starting with 9
 */
const PHONE_REGEX = /^9\d{9}$/;

/**
 * Normalize phone number by stripping non-digits and removing leading 0 or +63
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // Remove country code +63 or 63
  if (digits.startsWith('63') && digits.length === 12) {
    digits = digits.slice(2);
  }
  
  // Remove leading 0 if present
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  
  return digits;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const normalized = normalizePhoneNumber(phone);
  return PHONE_REGEX.test(normalized);
}

/**
 * Get validation error message for phone number
 */
export function getPhoneValidationError(phone: string, required = true): string | null {
  if (!phone || phone.trim() === '') {
    return required ? 'Phone number is required' : null;
  }
  
  const normalized = normalizePhoneNumber(phone);
  
  if (normalized.length === 0) {
    return 'Phone number must contain digits';
  }
  
  if (!normalized.startsWith('9')) {
    return 'Phone number must start with 9';
  }
  
  if (normalized.length < 10) {
    return `Phone number must be 10 digits (${normalized.length}/10)`;
  }
  
  if (normalized.length > 10) {
    return 'Phone number must be exactly 10 digits';
  }
  
  if (!PHONE_REGEX.test(normalized)) {
    return 'Invalid phone number format';
  }
  
  return null;
}

/**
 * Format phone for display (9XXXXXXXXX → 09XX XXX XXXX)
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  const digits = normalizePhoneNumber(phone);
  if (digits.length === 10 && digits.startsWith('9')) {
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string, normalized: string, isValid: boolean) => void;
  onBlur?: () => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
  showIcon?: boolean;
  /** Show validation feedback in real-time */
  showRealTimeValidation?: boolean;
}

/**
 * PhoneInput Component
 * 
 * A controlled phone number input with real-time validation.
 * Accepts Philippine mobile phone format: 9XXXXXXXXX
 * 
 * Features:
 * - Real-time validation feedback
 * - Automatic normalization (strips country code, leading zero)
 * - Visual indicators for valid/invalid states
 * - Only allows numeric input
 */
export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  onBlur,
  name = 'phone',
  placeholder = '9171234567',
  required = true,
  disabled = false,
  className = '',
  error,
  showIcon = true,
  showRealTimeValidation = true,
}) => {
  const [isTouched, setIsTouched] = useState(false);

  // Compute validation error during render
  const internalError = (showRealTimeValidation && (isTouched || value))
    ? getPhoneValidationError(value, required)
    : null;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    
    // Only allow digits and common phone characters
    const cleanedValue = rawValue.replace(/[^\d+\-\s()]/g, '');
    
    // Limit to reasonable length
    if (cleanedValue.replace(/\D/g, '').length > 12) {
      return;
    }
    
    const normalized = normalizePhoneNumber(cleanedValue);
    const isValid = isValidPhoneNumber(cleanedValue);
    
    onChange(cleanedValue, normalized, isValid);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setIsTouched(true);
    onBlur?.();
  }, [onBlur]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, tab, escape, enter, navigation keys
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowedKeys.includes(e.key)) {
      return;
    }
    
    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) {
      return;
    }
    
    // Allow only numbers and common phone characters
    if (!/[\d+\-\s()]/.test(e.key)) {
      e.preventDefault();
    }
  }, []);

  // Determine visual state
  const normalized = normalizePhoneNumber(value);
  const isValid = isValidPhoneNumber(value);
  const displayError = error || (showRealTimeValidation && isTouched ? internalError : null);
  const showSuccess = showRealTimeValidation && isValid && isTouched && !displayError;

  // Dynamic classes based on state
  const inputClasses = [
    'w-full py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:border-transparent transition-colors',
    showIcon ? 'pl-10 pr-3' : 'px-3',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    displayError
      ? 'border-red-500 focus:ring-red-500'
      : showSuccess
        ? 'border-green-500 focus:ring-green-500'
        : 'border-gray-300 dark:border-gray-600 focus:ring-orange-500',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-1">
      <div className="relative">
        {showIcon && (
          <Phone 
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              displayError ? 'text-red-400' : showSuccess ? 'text-green-500' : 'text-gray-400'
            }`} 
          />
        )}
        <input
          type="tel"
          inputMode="numeric"
          name={name}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          autoComplete="tel"
        />
        {/* Character count indicator */}
        {showRealTimeValidation && value && (
          <span 
            className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${
              normalized.length === 10 ? 'text-green-500' : 'text-gray-400'
            }`}
          >
            {normalized.length}/10
          </span>
        )}
      </div>
      
      {/* Error message */}
      {displayError && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <span className="inline-block w-1 h-1 bg-red-500 rounded-full"></span>
          {displayError}
        </p>
      )}
      
      {/* Success message */}
      {showSuccess && !displayError && (
        <p className="text-sm text-green-500 flex items-center gap-1">
          <span className="inline-block w-1 h-1 bg-green-500 rounded-full"></span>
          Valid phone number
        </p>
      )}
      
      {/* Helper text */}
      {!displayError && !showSuccess && (
        <p className="text-xs text-gray-500">
          Format: 9XXXXXXXXX (10 digits starting with 9)
        </p>
      )}
    </div>
  );
};

export default PhoneInput;
