/**
 * Password Generator Tests
 *
 * Comprehensive test suite for password-generator.ts with target >90% coverage.
 * Tests cryptographic password generation, validation, character sets,
 * and security requirements for database authentication.
 *
 * SECURITY CRITICAL - Ensures strong authentication credentials
 */

import { describe, it, expect } from '@jest/globals';
import {
  generatePassword,
  validatePassword,
  PasswordOptions,
  PasswordValidationResult,
} from '../../src/lib/password-generator';

describe('Password Generator', () => {
  describe('generatePassword', () => {
    describe('Default Options', () => {
      it('should generate password with default length (32 chars)', () => {
        const password = generatePassword();
        expect(password).toHaveLength(32);
      });

      it('should include uppercase by default', () => {
        const password = generatePassword();
        expect(password).toMatch(/[A-Z]/);
      });

      it('should include lowercase by default', () => {
        const password = generatePassword();
        expect(password).toMatch(/[a-z]/);
      });

      it('should include digits by default', () => {
        const password = generatePassword();
        expect(password).toMatch(/\d/);
      });

      it('should include special characters by default', () => {
        const password = generatePassword();
        expect(password).toMatch(/[!@#%^&*_+\-=]/);
      });

      it('should exclude ambiguous characters by default', () => {
        const password = generatePassword();
        expect(password).not.toMatch(/[ILO01]/); // Ambiguous chars
      });

      it('should generate different passwords on each call', () => {
        const password1 = generatePassword();
        const password2 = generatePassword();
        expect(password1).not.toBe(password2);
      });
    });

    describe('Custom Length', () => {
      it('should generate password with custom length', () => {
        const password = generatePassword({ length: 64 });
        expect(password).toHaveLength(64);
      });

      it('should generate password with minimum length (16)', () => {
        const password = generatePassword({ length: 16 });
        expect(password).toHaveLength(16);
      });

      it('should throw error for length < 16', () => {
        expect(() => generatePassword({ length: 15 })).toThrow(
          'Password length must be at least 16 characters'
        );
      });

      it('should throw error for length < 16 (edge case: 0)', () => {
        expect(() => generatePassword({ length: 0 })).toThrow(
          'Password length must be at least 16 characters'
        );
      });

      it('should throw error for negative length', () => {
        expect(() => generatePassword({ length: -1 })).toThrow(
          'Password length must be at least 16 characters'
        );
      });

      it('should handle very long passwords (256 chars)', () => {
        const password = generatePassword({ length: 256 });
        expect(password).toHaveLength(256);
      });
    });

    describe('Character Type Options', () => {
      it('should generate password with only uppercase', () => {
        const password = generatePassword({
          length: 32,
          uppercase: true,
          lowercase: false,
          digits: false,
          special: false,
          excludeAmbiguous: false,
        });

        expect(password).toMatch(/^[A-Z]+$/);
        expect(password).not.toMatch(/[a-z]/);
        expect(password).not.toMatch(/\d/);
      });

      it('should generate password with only lowercase', () => {
        const password = generatePassword({
          length: 32,
          uppercase: false,
          lowercase: true,
          digits: false,
          special: false,
          excludeAmbiguous: false,
        });

        expect(password).toMatch(/^[a-z]+$/);
        expect(password).not.toMatch(/[A-Z]/);
        expect(password).not.toMatch(/\d/);
      });

      it('should generate password with only digits', () => {
        const password = generatePassword({
          length: 32,
          uppercase: false,
          lowercase: false,
          digits: true,
          special: false,
          excludeAmbiguous: false,
        });

        expect(password).toMatch(/^\d+$/);
        expect(password).not.toMatch(/[A-Z]/);
        expect(password).not.toMatch(/[a-z]/);
      });

      it('should generate password with only special characters', () => {
        const password = generatePassword({
          length: 32,
          uppercase: false,
          lowercase: false,
          digits: false,
          special: true,
        });

        expect(password).toMatch(/^[!@#%^&*_+\-=]+$/);
        expect(password).not.toMatch(/[A-Za-z]/);
        expect(password).not.toMatch(/\d/);
      });

      it('should generate password with uppercase and lowercase only', () => {
        const password = generatePassword({
          length: 32,
          uppercase: true,
          lowercase: true,
          digits: false,
          special: false,
        });

        expect(password).toMatch(/[A-Z]/);
        expect(password).toMatch(/[a-z]/);
        expect(password).not.toMatch(/\d/);
        expect(password).not.toMatch(/[!@#%^&*_+\-=]/);
      });

      it('should generate password with digits and special only', () => {
        const password = generatePassword({
          length: 32,
          uppercase: false,
          lowercase: false,
          digits: true,
          special: true,
        });

        expect(password).toMatch(/\d/);
        expect(password).toMatch(/[!@#%^&*_+\-=]/);
        expect(password).not.toMatch(/[A-Z]/);
        expect(password).not.toMatch(/[a-z]/);
      });

      it('should throw error when all character types disabled', () => {
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

    describe('Ambiguous Character Exclusion', () => {
      it('should exclude ambiguous characters when enabled', () => {
        const password = generatePassword({ excludeAmbiguous: true });
        expect(password).not.toMatch(/[ILO01il]/);
      });

      it('should include ambiguous characters when disabled', () => {
        // Generate many passwords to ensure we see ambiguous chars
        const passwords = Array.from({ length: 50 }, () =>
          generatePassword({ excludeAmbiguous: false })
        ).join('');

        // At least one password should contain ambiguous chars (statistically very likely)
        const hasAmbiguous = /[ILO01il]/.test(passwords);
        expect(hasAmbiguous).toBe(true);
      });

      it('should exclude ambiguous uppercase (I, L, O)', () => {
        const passwords = Array.from({ length: 20 }, () =>
          generatePassword({
            uppercase: true,
            lowercase: false,
            digits: false,
            special: false,
            excludeAmbiguous: true,
          })
        ).join('');

        expect(passwords).not.toMatch(/[ILO]/);
        expect(passwords).toMatch(/[A-HJ-KM-NP-Z]/);
      });

      it('should exclude ambiguous lowercase (i, l, o)', () => {
        const passwords = Array.from({ length: 20 }, () =>
          generatePassword({
            uppercase: false,
            lowercase: true,
            digits: false,
            special: false,
            excludeAmbiguous: true,
          })
        ).join('');

        expect(passwords).not.toMatch(/[ilo]/);
        expect(passwords).toMatch(/[a-hj-km-npr-z]/);
      });

      it('should exclude ambiguous digits (0, 1)', () => {
        const passwords = Array.from({ length: 20 }, () =>
          generatePassword({
            uppercase: false,
            lowercase: false,
            digits: true,
            special: false,
            excludeAmbiguous: true,
          })
        ).join('');

        expect(passwords).not.toMatch(/[01]/);
        expect(passwords).toMatch(/[2-9]/);
      });
    });

    describe('Character Distribution', () => {
      it('should ensure at least one character from each enabled type', () => {
        // Test multiple times to ensure consistency
        for (let i = 0; i < 10; i++) {
          const password = generatePassword({
            length: 32,
            uppercase: true,
            lowercase: true,
            digits: true,
            special: true,
          });

          expect(password).toMatch(/[A-Z]/);
          expect(password).toMatch(/[a-z]/);
          expect(password).toMatch(/\d/);
          expect(password).toMatch(/[!@#%^&*_+\-=]/);
        }
      });

      it('should distribute characters evenly across password', () => {
        const password = generatePassword({ length: 100 });

        const uppercaseCount = (password.match(/[A-Z]/g) || []).length;
        const lowercaseCount = (password.match(/[a-z]/g) || []).length;
        const digitCount = (password.match(/\d/g) || []).length;
        const specialCount = (password.match(/[!@#%^&*_+\-=]/g) || []).length;

        // Each type should have at least 10% representation (statistically likely)
        expect(uppercaseCount).toBeGreaterThan(5);
        expect(lowercaseCount).toBeGreaterThan(5);
        expect(digitCount).toBeGreaterThan(5);
        expect(specialCount).toBeGreaterThan(5);
      });

      it('should not start with predictable pattern', () => {
        const passwords = Array.from({ length: 10 }, () => generatePassword({ length: 32 }));

        // First characters should be different (shuffled)
        const firstChars = passwords.map((p) => p[0]);
        const uniqueFirstChars = new Set(firstChars);

        expect(uniqueFirstChars.size).toBeGreaterThan(5); // At least 5 different first chars
      });
    });

    describe('Cryptographic Randomness', () => {
      it('should generate unique passwords on consecutive calls', () => {
        const passwords = new Set<string>();

        for (let i = 0; i < 100; i++) {
          passwords.add(generatePassword());
        }

        expect(passwords.size).toBe(100); // All unique
      });

      it('should have high entropy (no repeated patterns)', () => {
        const password = generatePassword({ length: 64 });

        // Check for no repeated substrings of length 4
        const substrings = new Set<string>();
        for (let i = 0; i < password.length - 3; i++) {
          const substr = password.substring(i, i + 4);
          substrings.add(substr);
        }

        // Most substrings should be unique (high entropy)
        expect(substrings.size).toBeGreaterThan(55);
      });

      it('should not generate sequential characters', () => {
        const password = generatePassword({ length: 64 });

        // Check for no sequences like "abc", "123", "xyz"
        const hasSequence = /abc|bcd|cde|123|234|345|xyz|uvw/i.test(password);
        expect(hasSequence).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle minimum viable password (16 chars, all types)', () => {
        const password = generatePassword({ length: 16 });

        expect(password).toHaveLength(16);
        expect(password).toMatch(/[A-Z]/);
        expect(password).toMatch(/[a-z]/);
        expect(password).toMatch(/\d/);
        expect(password).toMatch(/[!@#%^&*_+\-=]/);
      });

      it('should handle single character type with minimum length', () => {
        const password = generatePassword({
          length: 16,
          uppercase: true,
          lowercase: false,
          digits: false,
          special: false,
        });

        expect(password).toHaveLength(16);
        expect(password).toMatch(/^[A-HJ-KM-NP-Z]+$/); // Only uppercase, no ambiguous
      });

      it('should handle all character types with excludeAmbiguous=false', () => {
        const password = generatePassword({
          length: 32,
          uppercase: true,
          lowercase: true,
          digits: true,
          special: true,
          excludeAmbiguous: false,
        });

        expect(password).toHaveLength(32);
        expect(password).toMatch(/[A-Z]/);
        expect(password).toMatch(/[a-z]/);
        expect(password).toMatch(/\d/);
        expect(password).toMatch(/[!@#%^&*_+\-=]/);
      });
    });
  });

  describe('validatePassword', () => {
    describe('Valid Passwords', () => {
      it('should validate password meeting all requirements', () => {
        const password = 'Abc123!@#Def456$%^Ghi789&*(Jkl012';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(true);
        expect(result.length).toBeGreaterThan(31); // At least 32 chars
        expect(result.hasUppercase).toBe(true);
        expect(result.hasLowercase).toBe(true);
        expect(result.hasDigits).toBe(true);
        expect(result.hasSpecial).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate generated password', () => {
        const password = generatePassword({ length: 32 });
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate password with minimum length', () => {
        const password = 'Abcd1234!@#$Efgh5678%^&*Ijkl9012';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(true);
        expect(result.length).toBe(32);
      });

      it('should validate password exceeding minimum length', () => {
        const password = 'Abcd1234!@#$Efgh5678%^&*Ijkl9012ExtraLongPassword123!';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(true);
        expect(result.length).toBeGreaterThan(32);
      });
    });

    describe('Invalid Passwords - Length', () => {
      it('should reject password shorter than minimum length', () => {
        const password = 'Abc123!@#';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Password must be at least 32 characters long (current: 9)'
        );
      });

      it('should use default minimum length (32) when not specified', () => {
        const password = 'Abc123!@#Def456';
        const result = validatePassword(password);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('at least 32 characters'))).toBe(true);
      });

      it('should validate with custom minimum length', () => {
        const password = 'Abc123!@#Def456';
        const result = validatePassword(password, 10);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('Invalid Passwords - Missing Character Types', () => {
      it('should reject password without uppercase', () => {
        const password = 'abc123!@#def456$%^ghi789&*(jkl012';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(false);
        expect(result.hasUppercase).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
      });

      it('should reject password without lowercase', () => {
        const password = 'ABC123!@#DEF456$%^GHI789&*(JKL012';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(false);
        expect(result.hasLowercase).toBe(false);
        expect(result.errors).toContain('Password must contain at least one lowercase letter');
      });

      it('should reject password without digits', () => {
        const password = 'Abcd!@#$Efgh%^&*Ijkl(){}Mnop<>?Q';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(false);
        expect(result.hasDigits).toBe(false);
        expect(result.errors).toContain('Password must contain at least one digit');
      });

      it('should reject password without special characters', () => {
        const password = 'Abcd1234Efgh5678Ijkl9012Mnop3456';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(false);
        expect(result.hasSpecial).toBe(false);
        expect(result.errors).toContain('Password must contain at least one special character');
      });
    });

    describe('Invalid Passwords - Multiple Violations', () => {
      it('should report multiple errors for invalid password', () => {
        const password = 'abc123'; // Too short, no uppercase, no special
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
        expect(result.errors).toContain('Password must contain at least one special character');
        expect(result.errors.some((e) => e.includes('at least 32 characters'))).toBe(true);
      });

      it('should report all missing character types', () => {
        const password = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // Only lowercase
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
        expect(result.errors).toContain('Password must contain at least one digit');
        expect(result.errors).toContain('Password must contain at least one special character');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty password', () => {
        const result = validatePassword('', 32);

        expect(result.valid).toBe(false);
        expect(result.length).toBe(0);
        expect(result.hasUppercase).toBe(false);
        expect(result.hasLowercase).toBe(false);
        expect(result.hasDigits).toBe(false);
        expect(result.hasSpecial).toBe(false);
      });

      it('should handle password with unicode characters', () => {
        const password = 'Abc123!@#Def456$%^世界🌍Ghi789&*()';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(true); // Should still validate basic requirements
      });

      it('should handle password with whitespace', () => {
        const password = 'Abc 123 !@# Def 456 $%^ Ghi 789 &*()';
        const result = validatePassword(password, 32);

        expect(result.valid).toBe(true);
        expect(result.length).toBeGreaterThan(32);
      });

      it('should validate password exactly at minimum length', () => {
        const password = 'Abc123!@#Def456$%^Ghi789&*(Jk0';
        const result = validatePassword(password, 30);

        expect(result.valid).toBe(true);
        expect(result.length).toBe(30);
      });

      it('should handle very long passwords', () => {
        const longPassword = generatePassword({ length: 256 });
        const result = validatePassword(longPassword, 32);

        expect(result.valid).toBe(true);
        expect(result.length).toBe(256);
      });
    });

    describe('Validation Result Structure', () => {
      it('should return complete validation result', () => {
        const password = 'Abc123!@#';
        const result = validatePassword(password, 10);

        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('length');
        expect(result).toHaveProperty('hasUppercase');
        expect(result).toHaveProperty('hasLowercase');
        expect(result).toHaveProperty('hasDigits');
        expect(result).toHaveProperty('hasSpecial');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should report character type presence accurately', () => {
        const password = 'ABCD1234!@#$';
        const result = validatePassword(password, 10);

        expect(result.hasUppercase).toBe(true);
        expect(result.hasLowercase).toBe(false);
        expect(result.hasDigits).toBe(true);
        expect(result.hasSpecial).toBe(true);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should generate and validate password in one workflow', () => {
      const password = generatePassword({ length: 32 });
      const result = validatePassword(password, 32);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should generate passwords suitable for Redis requirepass', () => {
      const password = generatePassword({ length: 64 });
      const result = validatePassword(password, 64);

      expect(result.valid).toBe(true);
      expect(password).toHaveLength(64);
    });

    it('should generate passwords suitable for PostgreSQL authentication', () => {
      const password = generatePassword({ length: 32 });
      const result = validatePassword(password, 32);

      expect(result.valid).toBe(true);
      expect(password).toHaveLength(32);
    });

    it('should generate multiple unique valid passwords', () => {
      const passwords = Array.from({ length: 50 }, () => generatePassword({ length: 32 }));
      const uniquePasswords = new Set(passwords);

      expect(uniquePasswords.size).toBe(50); // All unique

      passwords.forEach((password) => {
        const result = validatePassword(password, 32);
        expect(result.valid).toBe(true);
      });
    });
  });
});
