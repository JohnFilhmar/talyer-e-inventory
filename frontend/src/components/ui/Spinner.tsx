import React from 'react';

/**
 * Spinner sizes
 */
type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Spinner component props
 */
interface SpinnerProps {
  /** Spinner size */
  size?: SpinnerSize;
  /** Color class (default: yellow-400) */
  color?: string;
  /** Additional CSS classes */
  className?: string;
  /** Loading text for screen readers */
  label?: string;
}

/**
 * Spinner component for loading states
 * 
 * Features:
 * - Multiple sizes
 * - Customizable color
 * - Accessible with sr-only label
 * 
 * Usage:
 * <Spinner size="lg" />
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = 'border-yellow-400',
  className = '',
  label = 'Loading...',
}) => {
  // Size styles
  const sizeStyles: Record<SpinnerSize, string> = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-4',
    lg: 'w-8 h-8 border-4',
    xl: 'w-12 h-12 border-4',
  };

  return (
    <div className={`inline-flex items-center justify-center ${className}`} role="status">
      <div
        className={`
          ${sizeStyles[size]}
          ${color}
          border-t-transparent
          rounded-full
          animate-spin
        `.trim()}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
};

export default Spinner;
