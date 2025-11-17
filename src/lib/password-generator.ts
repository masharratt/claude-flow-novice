/**
 * Secure Password Generator
 *
 * Generates cryptographically secure passwords for database authentication
 * with configurable complexity requirements and validation.
 *
 * Security Standards:
 * - Uses crypto.randomBytes() for cryptographic randomness
 * - Default minimum 32 characters for high entropy
 * - Requires mixed character types (uppercase, lowercase, digits, special)
 * - No ambiguous characters (0/O, 1/l, etc.)
 * - Suitable for Redis requirepass and PostgreSQL authentication
 */

import { randomBytes } from 'crypto';

export interface PasswordOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  digits?: boolean;
  special?: boolean;
  excludeAmbiguous?: boolean;
}

export interface PasswordValidationResult {
  valid: boolean;
  length: number;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigits: boolean;
  hasSpecial: boolean;
  errors: string[];
}

/**
 * Default character sets for password generation
 */
const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  uppercaseNoAmbiguous: 'ABCDEFGHJKMNPQRSTUVWXYZ', // Removed: I, L, O
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  lowercaseNoAmbiguous: 'abcdefghjkmnpqrstuvwxyz', // Removed: i, l, o
  digits: '0123456789',
  digitsNoAmbiguous: '23456789', // Removed: 0, 1
  special: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  specialSafe: '!@#%^&*_+-=', // Removed: $, `, ", ' for environment variable safety
};

/**
 * Generate a cryptographically secure random password
 */
export function generatePassword(options: PasswordOptions = {}): string {
  const {
    length = 32,
    uppercase = true,
    lowercase = true,
    digits = true,
    special = true,
    excludeAmbiguous = true,
  } = options;

  if (length < 16) {
    throw new Error('Password length must be at least 16 characters');
  }

  // Build character pool
  let charPool = '';
  const selectedSets: string[] = [];

  if (uppercase) {
    const chars = excludeAmbiguous ? CHAR_SETS.uppercaseNoAmbiguous : CHAR_SETS.uppercase;
    charPool += chars;
    selectedSets.push('uppercase');
  }

  if (lowercase) {
    const chars = excludeAmbiguous ? CHAR_SETS.lowercaseNoAmbiguous : CHAR_SETS.lowercase;
    charPool += chars;
    selectedSets.push('lowercase');
  }

  if (digits) {
    const chars = excludeAmbiguous ? CHAR_SETS.digitsNoAmbiguous : CHAR_SETS.digits;
    charPool += chars;
    selectedSets.push('digits');
  }

  if (special) {
    charPool += CHAR_SETS.specialSafe;
    selectedSets.push('special');
  }

  if (charPool.length === 0) {
    throw new Error('At least one character type must be enabled');
  }

  // Ensure password contains at least one character from each required type
  const password = new Array(length);
  let generated = 0;

  // First, place one character from each required set
  for (const setName of selectedSets) {
    let setChars: string;
    switch (setName) {
      case 'uppercase':
        setChars = uppercase ? (excludeAmbiguous ? CHAR_SETS.uppercaseNoAmbiguous : CHAR_SETS.uppercase) : '';
        break;
      case 'lowercase':
        setChars = lowercase ? (excludeAmbiguous ? CHAR_SETS.lowercaseNoAmbiguous : CHAR_SETS.lowercase) : '';
        break;
      case 'digits':
        setChars = digits ? (excludeAmbiguous ? CHAR_SETS.digitsNoAmbiguous : CHAR_SETS.digits) : '';
        break;
      case 'special':
        setChars = special ? CHAR_SETS.specialSafe : '';
        break;
      default:
        setChars = '';
    }

    if (setChars.length > 0 && generated < length) {
      const index = cryptoRandom(0, setChars.length - 1);
      password[generated] = setChars[index];
      generated++;
    }
  }

  // Fill remaining positions with random characters from pool
  while (generated < length) {
    const index = cryptoRandom(0, charPool.length - 1);
    password[generated] = charPool[index];
    generated++;
  }

  // Shuffle password to avoid predictable patterns
  return shuffleArray(password).join('');
}

/**
 * Validate password meets security requirements
 */
export function validatePassword(password: string, minLength: number = 32): PasswordValidationResult {
  const errors: string[] = [];
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigits = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long (current: ${password.length})`);
  }

  if (!hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!hasDigits) {
    errors.push('Password must contain at least one digit');
  }

  if (!hasSpecial) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    length: password.length,
    hasUppercase,
    hasLowercase,
    hasDigits,
    hasSpecial,
    errors,
  };
}

/**
 * Generate a cryptographically secure random integer in range [min, max]
 */
function cryptoRandom(min: number, max: number): number {
  if (min < 0 || max < 0 || min > max) {
    throw new Error('Invalid range: min must be >= 0 and min must be <= max');
  }

  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const randomBytes_ = randomBytes(bytesNeeded);

  // Convert bytes to integer and apply modulo to ensure uniform distribution
  let randomValue = 0;
  for (let i = 0; i < bytesNeeded; i++) {
    randomValue = (randomValue << 8) | randomBytes_[i];
  }

  // Use rejection sampling to ensure uniform distribution
  const limit = Math.floor(256 ** bytesNeeded / range) * range;

  if (randomValue < limit) {
    return min + (randomValue % range);
  }

  // Recursively try again if we exceeded the limit (very rare)
  return cryptoRandom(min, max);
}

/**
 * Shuffle array in-place using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = cryptoRandom(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}
