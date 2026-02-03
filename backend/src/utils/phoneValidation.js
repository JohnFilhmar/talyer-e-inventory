/**
 * Phone Number Validation Utility
 * 
 * Philippine mobile phone format: 9XXXXXXXXX (10 digits starting with 9)
 * Example: 9171234567
 */

/**
 * Regex pattern for Philippine mobile phone numbers
 * Must be exactly 10 digits starting with 9
 */
const PHONE_REGEX = /^9\d{9}$/;

/**
 * Validate Philippine phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  // Remove any non-digit characters for validation
  const digits = phone.replace(/\D/g, '');
  return PHONE_REGEX.test(digits);
}

/**
 * Normalize phone number by stripping non-digits and removing leading 0 or +63
 * Input formats accepted:
 * - 9171234567 (already normalized)
 * - 09171234567 (with leading 0)
 * - +639171234567 (with country code)
 * - 639171234567 (with country code, no +)
 * 
 * @param {string} phone - Phone number to normalize
 * @returns {string} - Normalized phone number (9XXXXXXXXX format)
 */
function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  
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
 * Format phone for display (9XXXXXXXXX → 09XX XXX XXXX)
 * @param {string} phone - Normalized phone number
 * @returns {string} - Formatted phone number for display
 */
function formatPhoneDisplay(phone) {
  if (!phone) return '';
  const digits = normalizePhoneNumber(phone);
  if (digits.length === 10 && digits.startsWith('9')) {
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Get validation error message for phone number
 * @param {string} phone - Phone number to validate
 * @returns {string|null} - Error message or null if valid
 */
function getPhoneValidationError(phone) {
  if (!phone || phone.trim() === '') {
    return 'Phone number is required';
  }
  
  const normalized = normalizePhoneNumber(phone);
  
  if (normalized.length === 0) {
    return 'Phone number must contain digits';
  }
  
  if (!normalized.startsWith('9')) {
    return 'Phone number must start with 9';
  }
  
  if (normalized.length !== 10) {
    return 'Phone number must be exactly 10 digits (9XXXXXXXXX)';
  }
  
  if (!PHONE_REGEX.test(normalized)) {
    return 'Invalid phone number format. Use format: 9XXXXXXXXX';
  }
  
  return null;
}

module.exports = {
  PHONE_REGEX,
  isValidPhoneNumber,
  normalizePhoneNumber,
  formatPhoneDisplay,
  getPhoneValidationError,
};
