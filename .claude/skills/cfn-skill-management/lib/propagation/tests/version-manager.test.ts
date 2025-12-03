/**
 * Tests for Version Manager
 */

import { VersionManager } from '../src/version-manager';

describe('VersionManager', () => {
  describe('parseVersion', () => {
    it('should parse valid semantic version', () => {
      const result = VersionManager.parseVersion('1.2.3');
      expect(result).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('should parse zero versions', () => {
      const result = VersionManager.parseVersion('0.0.0');
      expect(result).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('should throw on invalid format', () => {
      expect(() => VersionManager.parseVersion('1.2')).toThrow();
      expect(() => VersionManager.parseVersion('1.2.3.4')).toThrow();
      expect(() => VersionManager.parseVersion('a.b.c')).toThrow();
    });
  });

  describe('isValidVersion', () => {
    it('should accept valid versions', () => {
      expect(VersionManager.isValidVersion('1.0.0')).toBe(true);
      expect(VersionManager.isValidVersion('0.0.1')).toBe(true);
      expect(VersionManager.isValidVersion('10.20.30')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(VersionManager.isValidVersion('1.0')).toBe(false);
      expect(VersionManager.isValidVersion('1.0.0.0')).toBe(false);
      expect(VersionManager.isValidVersion('v1.0.0')).toBe(false);
    });
  });

  describe('compareVersions', () => {
    it('should detect major version increase', () => {
      expect(VersionManager.compareVersions('1.0.0', '2.0.0')).toBe('major');
    });

    it('should detect minor version increase', () => {
      expect(VersionManager.compareVersions('1.0.0', '1.1.0')).toBe('minor');
    });

    it('should detect patch version increase', () => {
      expect(VersionManager.compareVersions('1.0.0', '1.0.1')).toBe('patch');
    });

    it('should detect same version', () => {
      expect(VersionManager.compareVersions('1.0.0', '1.0.0')).toBe('same');
    });

    it('should detect downgrade', () => {
      expect(VersionManager.compareVersions('2.0.0', '1.0.0')).toBe('downgrade');
      expect(VersionManager.compareVersions('1.1.0', '1.0.0')).toBe('downgrade');
      expect(VersionManager.compareVersions('1.0.1', '1.0.0')).toBe('downgrade');
    });

    it('should compare correctly with zero versions', () => {
      expect(VersionManager.compareVersions('0.0.0', '0.0.1')).toBe('patch');
      expect(VersionManager.compareVersions('0.0.1', '0.1.0')).toBe('minor');
      expect(VersionManager.compareVersions('0.1.0', '1.0.0')).toBe('major');
    });
  });

  describe('validateVersionIncrement', () => {
    it('should validate patch version increment', () => {
      const result = VersionManager.validateVersionIncrement('1.0.0', '1.0.1', 'patch');
      expect(result.isValid).toBe(true);
      expect(result.changeType).toBe('patch');
    });

    it('should validate minor version increment', () => {
      const result = VersionManager.validateVersionIncrement('1.0.0', '1.1.0', 'minor');
      expect(result.isValid).toBe(true);
      expect(result.changeType).toBe('minor');
    });

    it('should validate major version increment', () => {
      const result = VersionManager.validateVersionIncrement('1.0.0', '2.0.0', 'major');
      expect(result.isValid).toBe(true);
      expect(result.changeType).toBe('major');
    });

    it('should reject mismatched change types', () => {
      const result = VersionManager.validateVersionIncrement('1.0.0', '1.1.0', 'patch');
      expect(result.isValid).toBe(false);
      expect(result.changeType).toBe('minor');
    });

    it('should reject same version', () => {
      const result = VersionManager.validateVersionIncrement('1.0.0', '1.0.0', 'patch');
      expect(result.isValid).toBe(false);
      expect(result.changeType).toBe('same');
    });

    it('should reject downgrade', () => {
      const result = VersionManager.validateVersionIncrement('1.0.0', '0.9.0', 'patch');
      expect(result.isValid).toBe(false);
      expect(result.changeType).toBe('downgrade');
    });
  });

  describe('getChangeDescription', () => {
    it('should return appropriate descriptions', () => {
      expect(VersionManager.getChangeDescription('major')).toContain('Breaking');
      expect(VersionManager.getChangeDescription('minor')).toContain('features');
      expect(VersionManager.getChangeDescription('patch')).toContain('Bug fix');
    });
  });
});
