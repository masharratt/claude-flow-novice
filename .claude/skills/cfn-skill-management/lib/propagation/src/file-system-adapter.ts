/**
 * File System Adapter for skill propagation operations
 */

import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import type { FileSystemAdapter } from './types';

export class NodeFileSystemAdapter implements FileSystemAdapter {
  /**
   * Read file content
   */
  async readFile(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${path}. ${(error as Error).message}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file is readable
   */
  async isReadable(path: string): Promise<boolean> {
    try {
      await fs.access(path, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate SHA256 hash of file content
   */
  async calculateHash(path: string): Promise<string> {
    try {
      const content = await this.readFile(path);
      return createHash('sha256').update(content).digest('hex');
    } catch (error) {
      throw new Error(`Failed to calculate hash for file: ${path}. ${(error as Error).message}`);
    }
  }

  /**
   * Validate file path is within project root (prevent path traversal)
   */
  static validatePath(filePath: string, projectRoot: string): boolean {
    const resolvedPath = resolve(filePath);
    const resolvedRoot = resolve(projectRoot);

    return resolvedPath.startsWith(resolvedRoot);
  }
}

/**
 * Mock file system adapter for testing
 */
export class MockFileSystemAdapter implements FileSystemAdapter {
  private files: Map<string, string> = new Map();
  private hashOverrides: Map<string, string> = new Map();

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  setHash(path: string, hash: string): void {
    this.hashOverrides.set(path, hash);
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async isReadable(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async calculateHash(path: string): Promise<string> {
    if (this.hashOverrides.has(path)) {
      return this.hashOverrides.get(path)!;
    }

    const content = await this.readFile(path);
    return createHash('sha256').update(content).digest('hex');
  }

  clear(): void {
    this.files.clear();
    this.hashOverrides.clear();
  }
}
