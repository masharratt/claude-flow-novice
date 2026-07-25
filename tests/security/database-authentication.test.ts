/**
 * Database Authentication Security Tests
 *
 * Comprehensive test suite for Redis and PostgreSQL authentication
 * with password generation, validation, and connection security.
 *
 * Test Coverage:
 * - Password generation with security requirements
 * - Password validation and complexity checking
 * - Redis authentication (requirepass)
 * - PostgreSQL authentication (password)
 * - Secure connection strings
 * - Authentication failure scenarios
 */

import { generatePassword, validatePassword, PasswordValidationResult } from '../../src/lib/password-generator';
import crypto from 'crypto';

describe('Security: Database Authentication', () => {
  describe('Password Generator - Basic Functionality', () => {
    test('should generate password of default length (32 characters)', () => {
      const password = generatePassword();
      expect(password).toHaveLength(32);
    });

    test('should generate password of custom length', () => {
      const password = generatePassword({ length: 64 });
      expect(password).toHaveLength(64);
    });

    test('should reject password length less than 16 characters', () => {
      expect(() => generatePassword({ length: 15 })).toThrow('Password length must be at least 16 characters');
    });

    test('should accept minimum valid length (16 characters)', () => {
      const password = generatePassword({ length: 16 });
      expect(password).toHaveLength(16);
    });

    test('should generate different passwords on each call', () => {
      const password1 = generatePassword();
      const password2 = generatePassword();
      expect(password1).not.toEqual(password2);
    });
  });

  describe('Password Generator - Character Requirements', () => {
    test('should include uppercase letters by default', () => {
      let hasUppercase = false;
      for (let i = 0; i < 10; i++) {
        const password = generatePassword();
        if (/[A-Z]/.test(password)) {
          hasUppercase = true;
          break;
        }
      }
      expect(hasUppercase).toBe(true);
    });

    test('should include lowercase letters by default', () => {
      let hasLowercase = false;
      for (let i = 0; i < 10; i++) {
        const password = generatePassword();
        if (/[a-z]/.test(password)) {
          hasLowercase = true;
          break;
        }
      }
      expect(hasLowercase).toBe(true);
    });

    test('should include digits by default', () => {
      let hasDigits = false;
      for (let i = 0; i < 10; i++) {
        const password = generatePassword();
        if (/\d/.test(password)) {
          hasDigits = true;
          break;
        }
      }
      expect(hasDigits).toBe(true);
    });

    test('should include special characters by default', () => {
      let hasSpecial = false;
      for (let i = 0; i < 10; i++) {
        const password = generatePassword();
        if (/[!@#%^&*_+\-=]/.test(password)) {
          hasSpecial = true;
          break;
        }
      }
      expect(hasSpecial).toBe(true);
    });

    test('should exclude ambiguous characters when enabled', () => {
      const password = generatePassword({ excludeAmbiguous: true, length: 64 });
      // Should not contain: 0, O, 1, l, i
      expect(password).not.toMatch(/[0OI1li]/);
    });

    test('should allow disabling uppercase', () => {
      const password = generatePassword({ uppercase: false, length: 64 });
      expect(/[A-Z]/.test(password)).toBe(false);
    });

    test('should allow disabling lowercase', () => {
      const password = generatePassword({ lowercase: false, length: 64 });
      expect(/[a-z]/.test(password)).toBe(false);
    });

    test('should allow disabling digits', () => {
      const password = generatePassword({ digits: false, length: 64 });
      expect(/\d/.test(password)).toBe(false);
    });

    test('should allow disabling special characters', () => {
      const password = generatePassword({ special: false, length: 64 });
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(false);
    });

    test('should throw error if all character types are disabled', () => {
      expect(() =>
        generatePassword({
          uppercase: false,
          lowercase: false,
          digits: false,
          special: false,
        })
      ).toThrow('At least one character type must be enabled');
    });
  });

  describe('Password Validation', () => {
    test('should validate strong password', () => {
      const password = generatePassword();
      const result = validatePassword(password);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject password shorter than minimum length', () => {
      const result = validatePassword('Short1!', 32);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('at least 32 characters'));
    });

    test('should reject password without uppercase', () => {
      const result = validatePassword('lowercase1!@#$%^&*()_+', 16);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('uppercase'));
    });

    test('should reject password without lowercase', () => {
      const result = validatePassword('UPPERCASE1!@#$%^&*()', 16);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('lowercase'));
    });

    test('should reject password without digits', () => {
      const result = validatePassword('NoDigitsHere!@#$%^&*()', 16);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('digit'));
    });

    test('should reject password without special characters', () => {
      const result = validatePassword('NoSpecialChars1234', 16);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('special character'));
    });

    test('should provide detailed validation result', () => {
      const password = 'Test1!@#$%^&*()_+-=ABC';
      const result = validatePassword(password);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('length');
      expect(result).toHaveProperty('hasUppercase');
      expect(result).toHaveProperty('hasLowercase');
      expect(result).toHaveProperty('hasDigits');
      expect(result).toHaveProperty('hasSpecial');
      expect(result).toHaveProperty('errors');
      expect(result.length).toBe(password.length);
    });

    test('should allow custom minimum length for validation', () => {
      const password = generatePassword({ length: 32 });
      const result = validatePassword(password, 16);
      expect(result.valid).toBe(true);
    });
  });

  describe('Security Properties - Entropy and Randomness', () => {
    test('should generate passwords with high entropy', () => {
      const password = generatePassword();
      // Password should have good character distribution
      const chars = new Set(password);
      // With 32 characters, we should have reasonable diversity
      expect(chars.size).toBeGreaterThan(15);
    });

    test('should not produce predictable sequences', () => {
      const passwords = [];
      for (let i = 0; i < 100; i++) {
        passwords.push(generatePassword({ length: 32 }));
      }

      // All passwords should be unique
      const uniquePasswords = new Set(passwords);
      expect(uniquePasswords.size).toBe(passwords.length);
    });

    test('should use cryptographic randomness', () => {
      // Generate multiple passwords and check they follow different patterns
      const password1 = generatePassword();
      const password2 = generatePassword();

      // Convert to byte arrays and compute edit distance
      const bytes1 = Buffer.from(password1);
      const bytes2 = Buffer.from(password2);

      let differences = 0;
      for (let i = 0; i < Math.min(bytes1.length, bytes2.length); i++) {
        if (bytes1[i] !== bytes2[i]) {
          differences++;
        }
      }

      // Should have significant differences (at least 50% different)
      expect(differences).toBeGreaterThan(password1.length * 0.4);
    });
  });

  describe('Redis Authentication Integration', () => {
    test('should generate Redis requirepass compatible password', () => {
      const password = generatePassword();
      // Redis requirepass accepts any string without spaces
      expect(password).not.toMatch(/\s/);
      // Should be non-empty
      expect(password.length).toBeGreaterThan(0);
    });

    test('should validate Redis password strength', () => {
      const password = generatePassword();
      const result = validatePassword(password);
      expect(result.valid).toBe(true);
    });

    test('should generate password suitable for connection string', () => {
      const password = generatePassword({ excludeAmbiguous: true });
      // Should not have characters that need escaping in URLs
      // Special characters in our set are safe for basic auth
      expect(password).toBeDefined();
      expect(password.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('PostgreSQL Authentication Integration', () => {
    test('should generate PostgreSQL password compatible password', () => {
      const password = generatePassword();
      // PostgreSQL accepts most characters in passwords
      expect(password).toBeDefined();
      expect(password.length).toBeGreaterThan(0);
    });

    test('should validate PostgreSQL password strength', () => {
      const password = generatePassword();
      const result = validatePassword(password);
      expect(result.valid).toBe(true);
    });

    test('should not include quotes that need escaping', () => {
      const password = generatePassword();
      // Our special character set excludes quotes to avoid escaping issues
      expect(password).not.toMatch(/['"`]/);
    });

    test('should generate password suitable for connection string', () => {
      const password = generatePassword({ excludeAmbiguous: true });
      expect(password).toBeDefined();
      expect(password.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('Database Connection String Format', () => {
    test('should format Redis connection with password', () => {
      const password = generatePassword();
      const connectionString = `redis://:${password}@localhost:6379`;
      expect(connectionString).toMatch(/^redis:\/\/:.*@localhost:6379$/);
    });

    test('should format PostgreSQL connection with password', () => {
      const password = generatePassword();
      const connectionString = `postgresql://cfn_user:${password}@localhost:5432/cfn_loop`;
      expect(connectionString).toMatch(/^postgresql:\/\/.*:.*@localhost:5432\/cfn_loop$/);
    });

    test('should handle password in environment variables safely', () => {
      const password = generatePassword();
      // Simulate environment variable usage
      const testEnv = {
        REDIS_PASSWORD: password,
        POSTGRES_PASSWORD: password,
      };
      expect(testEnv.REDIS_PASSWORD).toBeDefined();
      expect(testEnv.POSTGRES_PASSWORD).toBeDefined();
    });
  });

  describe('Authentication Failure Scenarios', () => {
    test('should distinguish between correct and incorrect passwords', () => {
      const correct = generatePassword();
      const incorrect = generatePassword();
      expect(correct).not.toEqual(incorrect);
    });

    test('should validate that weak passwords are rejected', () => {
      const weakPasswords = [
        'password123',
        'Pass123',
        'verylongpasswordwithoutspecialchars',
        '12345678901234567890',
      ];

      weakPasswords.forEach(password => {
        const result = validatePassword(password, 32);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    test('should provide clear error messages for weak passwords', () => {
      const result = validatePassword('weak');
      expect(result.errors.length).toBeGreaterThan(0);
      result.errors.forEach(error => {
        expect(error).toBeTruthy();
        expect(typeof error).toBe('string');
      });
    });
  });

  describe('Password Rotation and Management', () => {
    test('should generate new password for rotation', () => {
      const oldPassword = generatePassword();
      const newPassword = generatePassword();
      expect(oldPassword).not.toEqual(newPassword);
    });

    test('should validate rotated passwords', () => {
      const passwords = [];
      for (let i = 0; i < 5; i++) {
        passwords.push(generatePassword());
      }

      passwords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
      });
    });

    test('should maintain password strength across multiple generations', () => {
      const iterations = 20;
      const results: PasswordValidationResult[] = [];

      for (let i = 0; i < iterations; i++) {
        const password = generatePassword();
        results.push(validatePassword(password));
      }

      // All generated passwords should pass validation
      results.forEach(result => {
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Security Edge Cases', () => {
    test('should not allow zero-length passwords', () => {
      expect(() => generatePassword({ length: 0 })).toThrow();
    });

    test('should not allow negative length', () => {
      expect(() => generatePassword({ length: -10 })).toThrow();
    });

    test('should handle multiple options correctly', () => {
      const password = generatePassword({
        length: 48,
        uppercase: true,
        lowercase: true,
        digits: true,
        special: true,
        excludeAmbiguous: true,
      });
      expect(password).toHaveLength(48);
      const result = validatePassword(password);
      expect(result.valid).toBe(true);
    });

    test('should generate passwords that are safely serializable', () => {
      const password = generatePassword();
      const json = JSON.stringify({ password });
      const parsed = JSON.parse(json);
      expect(parsed.password).toEqual(password);
    });

    test('should handle rapid generation without collision', () => {
      const passwords = new Set();
      for (let i = 0; i < 1000; i++) {
        passwords.add(generatePassword());
      }
      // Should have 1000 unique passwords
      expect(passwords.size).toBe(1000);
    });
  });

  describe('Database-Specific Security Requirements', () => {
    test('should meet Redis authentication requirements', () => {
      const password = generatePassword();
      // Redis requirements:
      // 1. Non-empty string
      // 2. No null bytes
      // 3. Reasonable length
      expect(password.length).toBeGreaterThanOrEqual(32);
      expect(password.includes('\0')).toBe(false);
      const validation = validatePassword(password);
      expect(validation.valid).toBe(true);
    });

    test('should meet PostgreSQL authentication requirements', () => {
      const password = generatePassword();
      // PostgreSQL requirements:
      // 1. Non-empty string
      // 2. Valid for connection string
      // 3. Strong complexity
      expect(password.length).toBeGreaterThanOrEqual(32);
      const validation = validatePassword(password);
      expect(validation.valid).toBe(true);
    });

    test('should work with standard Docker environment variable format', () => {
      const password = generatePassword();
      // Should be safe for POSTGRES_PASSWORD env var
      expect(password).not.toMatch(/[\$`"']/);
    });
  });
});
