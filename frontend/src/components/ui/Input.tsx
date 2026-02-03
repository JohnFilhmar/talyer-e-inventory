import React, { forwardRef, InputHTMLAttributes, useId } from 'react';

/**
 * Input component props
 */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label text for the input */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Helper text below the input */
  helperText?: string;
  /** Full width input */
  fullWidth?: boolean;
  /** Left icon/addon */
  leftIcon?: React.ReactNode;
  /** Right icon/addon */
  rightIcon?: React.ReactNode;
}

/**
 * Input component following design system
 * 
 * Features:
 * - Consistent styling with yellow focus ring
 * - Error state with red border and message
 * - Support for icons
 * - Accessible with proper labels
 * 
 * Usage:
 * <Input label="Email" type="email" error={errors.email?.message} />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      fullWidth = true,
      leftIcon,
      rightIcon,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    // Generate unique ID if not provided
    const generatedId = useId();
    const inputId = id || generatedId;

    const baseInputStyles = `
      block px-3 py-2 
      border rounded-md shadow-sm 
      text-black placeholder-gray-400
      focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400
      disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500
    `;

    const errorStyles = error
      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300';

    const widthStyles = fullWidth ? 'w-full' : '';
    const paddingLeftStyles = leftIcon ? 'pl-10' : '';
    const paddingRightStyles = rightIcon ? 'pr-10' : '';

    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`
              ${baseInputStyles}
              ${errorStyles}
              ${widthStyles}
              ${paddingLeftStyles}
              ${paddingRightStyles}
              ${className}
            `.trim()}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />

          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1 text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
