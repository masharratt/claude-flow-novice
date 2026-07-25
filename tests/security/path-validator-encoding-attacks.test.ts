/**
 * Path Validator Encoding Bypass Security Tests
 *
 * Comprehensive test suite for URL-encoding and Unicode-encoding bypass attacks.
 * Tests defense against advanced path traversal techniques that attempt to bypass
 * normalization by encoding the traversal sequences.
 *
 * Attack Vectors Tested:
 * - Double URL-encoding (%252e%252e%252f → %2e%2e%2f → ../)
 * - Triple URL-encoding (nested encoding chains)
 * - Mixed encoding strategies (partial encoding)
 * - Unicode overlong encoding (UTF-8 encoding bypasses)
 * - UTF-16 encoding sequences
 * - Null byte injection combined with encoding
 * - Case-sensitivity encoding bypasses
 * - Backslash normalization with encoding
 * - Iterative decoding validation
 *
 * CVSS Score: 7.5 (High) - Path Traversal via Encoding Bypass
 *
 * Coverage Target: >95% of path decoding and validation logic
 */

import { describe, it, expect } from '@jest/globals';
import {
  validatePath,
  isPathSafe,
  PathValidationError,
} from '../../src/lib/path-validator';

// Base directory for all tests
const BASE_DIR = '/var/app/project';

describe('Path Validator - Double URL-Encoding Attacks', () => {
  describe('Basic Double-Encoding Patterns', () => {
    it('should block double-encoded directory traversal: %252e%252e%252f', () => {
      // %252e%252e%252f → (decode once) → %2e%2e%2f → (decode twice) → ../
      const maliciousPath = '%252e%252e%252f%252e%252e%252fetc%252fpasswd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block triple-encoded traversal: %25252e', () => {
      // %25252e → %252e → %2e → .
      const maliciousPath = '%25252e%25252e%25252fetc%25252fpasswd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block quadruple-encoded traversal (extreme nesting)', () => {
      // Four layers of encoding
      const maliciousPath = '%2525252e%2525252e%2525252fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block mixed single and double encoding', () => {
      // %252e%252e/ → %2e%2e/ → ../
      const maliciousPath = '%252e%252e/etc/passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block partially encoded traversal sequences', () => {
      // .%252e → .%2e → ..
      const maliciousPath = '.%252e/.%252e/etc/passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });

  describe('Forward Slash Encoding Variations', () => {
    it('should block double-encoded forward slashes: %252f', () => {
      const maliciousPath = '..%252f..%252fetc%252fpasswd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block mixed slash encodings', () => {
      // Single-encoded + double-encoded slashes
      const maliciousPath = '..%2f..%252fetc/passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block encoded backslash alternatives: %255c', () => {
      // Windows-style path traversal with encoding
      const maliciousPath = '..%255c..%255cwindows%255csystem32';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });

  describe('Case Sensitivity Encoding Bypasses', () => {
    it('should block uppercase hex encoding: %2E%2E%2F', () => {
      // Some parsers treat uppercase differently
      const maliciousPath = '%2E%2E%2F%2E%2E%2Fetc%2Fpasswd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block mixed case hex encoding: %2e%2E%2F', () => {
      const maliciousPath = '%2e%2E%2F%2E%2e%2fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block double-encoded with mixed case: %252E', () => {
      const maliciousPath = '%252E%252E%252Fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });
});

describe('Path Validator - Unicode Encoding Attacks', () => {
  describe('Overlong UTF-8 Encoding', () => {
    it('should block overlong UTF-8 encoded dot: %c0%ae', () => {
      // Overlong encoding of "." (U+002E)
      // Standard: %2e
      // Overlong: %c0%ae (2-byte encoding of ASCII)
      const maliciousPath = '%c0%ae%c0%ae%c0%afetc%c0%afpasswd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block overlong UTF-8 encoded forward slash: %c0%af', () => {
      // Overlong encoding of "/" (U+002F)
      const maliciousPath = '..%c0%af..%c0%afetc%c0%afpasswd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block 3-byte overlong encoding: %e0%80%ae', () => {
      // Even longer overlong encoding of "."
      const maliciousPath = '%e0%80%ae%e0%80%ae%e0%80%af';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block 4-byte overlong encoding: %f0%80%80%ae', () => {
      // Maximum overlong encoding
      const maliciousPath = '%f0%80%80%ae%f0%80%80%ae%f0%80%80%af';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block mixed overlong and standard encoding', () => {
      const maliciousPath = '%c0%ae./%c0%afetc/passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });

  describe('UTF-16 Encoding', () => {
    it('should block UTF-16 encoded traversal: %u002e%u002e', () => {
      // UTF-16 encoding (used by some systems)
      const maliciousPath = '%u002e%u002e%u002fetc%u002fpasswd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block UTF-16 BE encoding: %fe%ff%00%2e', () => {
      // UTF-16 Big Endian with BOM
      const maliciousPath = '%fe%ff%00%2e%00%2e%00%2f';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block UTF-16 LE encoding: %ff%fe%2e%00', () => {
      // UTF-16 Little Endian with BOM
      const maliciousPath = '%ff%fe%2e%00%2e%00%2f%00';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block mixed UTF-16 and URL encoding', () => {
      const maliciousPath = '%u002e%2e/%u002fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });

  describe('Unicode Homoglyph Attacks', () => {
    it('should block fullwidth solidus (U+FF0F): ／', () => {
      // Looks like "/" but is different character
      const maliciousPath = '..／..／etc／passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block division slash (U+2215): ∕', () => {
      const maliciousPath = '..∕..∕etc∕passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block fullwidth period (U+FF0E): ．', () => {
      const maliciousPath = '．．/．．/etc/passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block bullet operator (U+2219): ∙', () => {
      // Another period-like character
      const maliciousPath = '∙∙/∙∙/etc/passwd';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });
});

describe('Path Validator - Null Byte Injection with Encoding', () => {
  it('should block null byte with encoded traversal: %00%2e%2e%2f', () => {
    // Null byte can truncate strings in C-based parsers
    const maliciousPath = 'safe.txt%00%2e%2e%2f%2e%2e%2fetc%2fpasswd';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block null byte with double-encoded traversal', () => {
    const maliciousPath = 'safe.txt%00%252e%252e%252f';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block encoded null byte: %2500', () => {
    // Double-encoded null byte
    const maliciousPath = 'safe.txt%2500/../../../etc/passwd';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block null byte in directory name', () => {
    const maliciousPath = 'docs%00/../../../etc/passwd';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block multiple null bytes with traversal', () => {
    const maliciousPath = '%00%00%2e%2e%2f%00%2e%2e%2f';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });
});

describe('Path Validator - Backslash Normalization Attacks', () => {
  it('should block double-encoded backslash: %255c', () => {
    // Windows path separator
    const maliciousPath = '..%255c..%255cwindows';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block mixed forward slash and backslash encoding', () => {
    const maliciousPath = '..%2f..%5c..%252fetc';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block single-encoded backslash: %5c', () => {
    const maliciousPath = '..%5c..%5cwindows%5csystem32';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block Unicode backslash variants', () => {
    // Fullwidth reverse solidus (U+FF3C)
    const maliciousPath = '..＼..＼windows';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block mixed literal and encoded backslashes', () => {
    const maliciousPath = '..\\..%5c..%255c';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });
});

describe('Path Validator - Iterative Decoding Edge Cases', () => {
  describe('Maximum Iteration Detection', () => {
    it('should handle deeply nested encoding (10 layers)', () => {
      // Build 10 layers of encoding
      let encoded = '.';
      for (let i = 0; i < 10; i++) {
        encoded = encodeURIComponent(encoded);
      }
      const maliciousPath = `${encoded}${encoded}/${encoded}${encoded}/etc`;

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should handle recursive encoding loops', () => {
      // Some implementations have bugs where decoding creates new encoded sequences
      const maliciousPath = '%2525252525252e%2525252525252e%252525252525252f';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should detect stable decoding state', () => {
      // After iterative decoding, path should stabilize
      const maliciousPath = '%252e%252e%252f';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should handle alternating encoding patterns', () => {
      // Alternate between different encoding strategies
      const maliciousPath = '%2e%252e%2f%252f..';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });

  describe('Partial Decoding States', () => {
    it('should block paths that become malicious after partial decoding', () => {
      // Safe until second decode
      const maliciousPath = 'docs/%252e%252e%252fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block progressive traversal construction', () => {
      // Each decode step gets closer to traversal
      const maliciousPath = '%252e./%252e./etc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should validate at each decoding step', () => {
      // Even intermediate states should be checked
      const maliciousPath = '%252e%252e/%252e%252e/';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });

  describe('Encoding Chain Complexity', () => {
    it('should handle mixed URL and Unicode encoding chains', () => {
      // Combine multiple encoding strategies
      const maliciousPath = '%252e%c0%ae/%u002e%2e/etc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block encoded directory separators in chain', () => {
      const maliciousPath = 'docs%252f%252e%252e%252f%252e%252e%252fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should handle URL fragment encoding: %23', () => {
      // Fragment identifiers with encoded traversal
      const maliciousPath = 'file%23%252e%252e%252fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });

    it('should block query string encoding: %3f', () => {
      // Query parameters with encoded traversal
      const maliciousPath = 'api%3fpath=%252e%252e%252fetc';

      expect(() => {
        validatePath(maliciousPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });
});

describe('Path Validator - Valid Encoded Paths (False Positives)', () => {
  it('should accept properly encoded safe paths', () => {
    // URL-safe encoding of valid filename: "file name.txt" → "file%20name.txt"
    const safePath = 'docs/file%20name.txt';

    expect(() => {
      validatePath(safePath, BASE_DIR);
    }).not.toThrow();
  });

  it('should accept encoded special characters in filenames', () => {
    // Safe encoding of brackets, parentheses
    const safePath = 'docs/config%5Bprod%5D.json';

    expect(() => {
      validatePath(safePath, BASE_DIR);
    }).not.toThrow();
  });

  it('should accept Unicode characters in paths', () => {
    // Valid Unicode filenames
    const safePath = 'docs/文档.md';

    expect(() => {
      validatePath(safePath, BASE_DIR);
    }).not.toThrow();
  });

  it('should accept encoded ampersand in filename', () => {
    const safePath = 'docs/API%26Reference.md';

    expect(() => {
      validatePath(safePath, BASE_DIR);
    }).not.toThrow();
  });

  it('should accept encoded equals sign in filename', () => {
    const safePath = 'docs/config%3Dvalue.txt';

    expect(() => {
      validatePath(safePath, BASE_DIR);
    }).not.toThrow();
  });
});

describe('Path Validator - Combined Attack Vectors', () => {
  it('should block triple-encoded traversal with null bytes', () => {
    const maliciousPath = '%00%25252e%25252e%25252f';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block Unicode overlong with double-encoding', () => {
    const maliciousPath = '%25c0%25ae%25c0%25ae%25c0%25af';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block mixed case with triple-encoding', () => {
    const maliciousPath = '%25252E%25252e%25252F';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block backslash with Unicode homoglyphs', () => {
    const maliciousPath = '..%5c..／etc∕passwd';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });

  it('should block all encoding strategies in single path', () => {
    // Kitchen sink: double-encoding + overlong UTF-8 + UTF-16 + homoglyphs
    const maliciousPath = '%252e%c0%ae%u002e．/etc';

    expect(() => {
      validatePath(maliciousPath, BASE_DIR);
    }).toThrow(PathValidationError);
  });
});

describe('Path Validator - Security Boundary Tests', () => {
  describe('Encoding Detection Coverage', () => {
    it('should detect encoded dots in all positions', () => {
      const attacks = [
        '%2e%2e/etc',      // Both dots encoded
        '.%2e/etc',        // Second dot encoded
        '%2e./etc',        // First dot encoded
      ];

      attacks.forEach(attack => {
        expect(() => {
          validatePath(attack, BASE_DIR);
        }).toThrow(PathValidationError);
      });
    });

    it('should detect encoded slashes in all positions', () => {
      const attacks = [
        '../%2fetc',       // Slash after traversal
        '..%2f../etc',     // Slash between traversal
        '%2f../etc',       // Leading slash encoded
      ];

      attacks.forEach(attack => {
        expect(() => {
          validatePath(attack, BASE_DIR);
        }).toThrow(PathValidationError);
      });
    });

    it('should validate decoding consistency', () => {
      // Same attack in different encodings should all fail
      const attacks = [
        '../etc/passwd',           // Plain
        '%2e%2e/etc/passwd',       // Single-encoded
        '%252e%252e/etc/passwd',   // Double-encoded
        '%c0%ae%c0%ae/etc/passwd', // Overlong UTF-8
      ];

      attacks.forEach(attack => {
        expect(() => {
          validatePath(attack, BASE_DIR);
        }).toThrow(PathValidationError);
      });
    });
  });

  describe('Performance Under Attack Load', () => {
    it('should handle 1000 consecutive encoded attacks efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        const maliciousPath = `%252e%252e%252f${i}/etc/passwd`;

        expect(() => {
          validatePath(maliciousPath, BASE_DIR);
        }).toThrow(PathValidationError);
      }

      const duration = Date.now() - start;

      // Should complete in under 5 seconds even with 1000 attacks
      expect(duration).toBeLessThan(5000);
    });

    it('should handle deeply nested encoding without stack overflow', () => {
      // 50 layers of encoding
      let encoded = '.';
      for (let i = 0; i < 50; i++) {
        encoded = encodeURIComponent(encoded);
      }

      expect(() => {
        validatePath(`${encoded}/${encoded}`, BASE_DIR);
      }).not.toThrow('Maximum call stack');
    });

    it('should handle very long encoded strings', () => {
      // 10,000 character encoded path
      const longPath = '%252e'.repeat(3333) + '%252f';

      expect(() => {
        validatePath(longPath, BASE_DIR);
      }).toThrow(PathValidationError);
    });
  });
});

describe('Path Validator - isPathSafe() Convenience API', () => {
  it('should return false for double-encoded attacks', () => {
    const result = isPathSafe('%252e%252e%252fetc', BASE_DIR);
    expect(result).toBe(false);
  });

  it('should return false for Unicode overlong attacks', () => {
    const result = isPathSafe('%c0%ae%c0%ae%c0%af', BASE_DIR);
    expect(result).toBe(false);
  });

  it('should return false for UTF-16 attacks', () => {
    const result = isPathSafe('%u002e%u002e%u002f', BASE_DIR);
    expect(result).toBe(false);
  });

  it('should return false for null byte injection', () => {
    const result = isPathSafe('safe.txt%00%2e%2e%2f', BASE_DIR);
    expect(result).toBe(false);
  });

  it('should return true for valid encoded filenames', () => {
    const result = isPathSafe('docs/file%20name.txt', BASE_DIR);
    expect(result).toBe(true);
  });

  it('should not throw exceptions for any encoding', () => {
    expect(() => {
      isPathSafe('%252e%252e%252f', BASE_DIR);
      isPathSafe('%c0%ae%c0%ae%c0%af', BASE_DIR);
      isPathSafe('%u002e%u002e%u002f', BASE_DIR);
    }).not.toThrow();
  });
});

describe('Path Validator - Error Context for Encoded Attacks', () => {
  it('should provide detailed error for double-encoded attacks', () => {
    try {
      validatePath('%252e%252e%252f', BASE_DIR);
      fail('Should have thrown PathValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(PathValidationError);
      const err = error as PathValidationError;
      expect(err.context?.reason).toBeDefined();
      expect(err.context?.filePath).toBe('%252e%252e%252f');
    }
  });

  it('should provide detailed error for Unicode attacks', () => {
    try {
      validatePath('%c0%ae%c0%ae%c0%af', BASE_DIR);
      fail('Should have thrown PathValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(PathValidationError);
      const err = error as PathValidationError;
      expect(err.context?.reason).toBeDefined();
    }
  });

  it('should provide detailed error for combined attacks', () => {
    try {
      validatePath('%00%252e%252e%252f', BASE_DIR);
      fail('Should have thrown PathValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(PathValidationError);
      const err = error as PathValidationError;
      expect(err.context?.filePath).toContain('%00');
    }
  });
});
