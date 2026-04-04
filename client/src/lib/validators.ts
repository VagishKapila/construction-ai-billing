/**
 * Form validation utilities
 * Used for client-side validation of user input
 */

/**
 * Validate an email address
 * @param email - The email to validate
 * @returns true if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  // RFC 5322 simplified regex for email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate a phone number
 * Accepts common US phone formats: (555) 123-4567, 555-123-4567, 555.123.4567, 5551234567
 * @param phone - The phone number to validate
 * @returns true if valid, false otherwise
 */
export function isValidPhone(phone: string): boolean {
  // Remove common separators and spaces
  const cleaned = phone.replace(/[\s\-().]/g, '')
  // Must be 10 digits (US phone)
  return /^\d{10}$/.test(cleaned)
}

/**
 * Validate a password
 * Requirements:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * @param password - The password to validate
 * @returns Object with valid boolean and message string
 */
export function isValidPassword(
  password: string
): { valid: boolean; message: string } {
  if (!password) {
    return { valid: false, message: 'Password is required' }
  }

  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' }
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 uppercase letter' }
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 lowercase letter' }
  }

  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 number' }
  }

  return { valid: true, message: '' }
}

/**
 * Check if a value is required (non-empty)
 * @param value - The value to check
 * @returns true if value is provided (non-empty string), false if empty/null/undefined
 */
export function isRequired(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false
  }

  return value.trim().length > 0
}

/**
 * Validate that a value is a positive number
 * @param value - The value to check (number or string)
 * @returns true if value is a positive number, false otherwise
 */
export function isPositiveNumber(value: number | string): boolean {
  const num = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(num)) {
    return false
  }

  return num > 0
}
