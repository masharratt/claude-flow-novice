/**
 * Tests for File System Adapter
 */

import { MockFileSystemAdapter } from '../src/file-system-adapter';

describe('MockFileSystemAdapter', () => {
  let adapter: MockFileSystemAdapter;

  beforeEach(() => {
    adapter = new MockFileSystemAdapter();
  });

  afterEach(() => {
    adapter.clear();
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      adapter.setFile('/path/to/file.md', 'content');
      const content = await adapter.readFile('/path/to/file.md');
      expect(content).toBe('content');
    });

    it('should throw on missing file', async () => {
      await expect(adapter.readFile('/missing/file.md')).rejects.toThrow();
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      adapter.setFile('/path/to/file.md', 'content');
      const exists = await adapter.fileExists('/path/to/file.md');
      expect(exists).toBe(true);
    });

    it('should return false for missing file', async () => {
      const exists = await adapter.fileExists('/missing/file.md');
      expect(exists).toBe(false);
    });
  });

  describe('isReadable', () => {
    it('should return true for readable file', async () => {
      adapter.setFile('/path/to/file.md', 'content');
      const readable = await adapter.isReadable('/path/to/file.md');
      expect(readable).toBe(true);
    });

    it('should return false for unreadable file', async () => {
      const readable = await adapter.isReadable('/missing/file.md');
      expect(readable).toBe(false);
    });
  });

  describe('calculateHash', () => {
    it('should calculate hash for file content', async () => {
      adapter.setFile('/path/to/file.md', 'test content');
      const hash = await adapter.calculateHash('/path/to/file.md');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 hex length
    });

    it('should return same hash for same content', async () => {
      adapter.setFile('/path/file1.md', 'same content');
      adapter.setFile('/path/file2.md', 'same content');
      const hash1 = await adapter.calculateHash('/path/file1.md');
      const hash2 = await adapter.calculateHash('/path/file2.md');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', async () => {
      adapter.setFile('/path/file1.md', 'content 1');
      adapter.setFile('/path/file2.md', 'content 2');
      const hash1 = await adapter.calculateHash('/path/file1.md');
      const hash2 = await adapter.calculateHash('/path/file2.md');
      expect(hash1).not.toBe(hash2);
    });

    it('should use overridden hash if set', async () => {
      adapter.setFile('/path/to/file.md', 'content');
      adapter.setHash('/path/to/file.md', 'custom-hash-value');
      const hash = await adapter.calculateHash('/path/to/file.md');
      expect(hash).toBe('custom-hash-value');
    });

    it('should throw on missing file', async () => {
      await expect(adapter.calculateHash('/missing/file.md')).rejects.toThrow();
    });
  });
});
