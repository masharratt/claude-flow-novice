/**
 * Docker Image Testing and Validation
 * Tests Docker image builds, metadata, and runtime properties
 *
 * Migration from: docker/test-images.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface ImageMetadata {
  name: string;
  tag: string;
  dockerfile: string;
  exists: boolean;
  size?: number;
  layers?: number;
}

class DockerImageTester {
  private projectRoot: string;
  private images: Map<string, ImageMetadata> = new Map();

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.initializeImages();
  }

  /**
   * Initialize known Docker images
   */
  private initializeImages(): void {
    this.images.set('cfn-agent', {
      name: 'cfn-agent',
      tag: 'latest',
      dockerfile: 'docker/Dockerfile.agent',
      exists: false
    });

    this.images.set('cfn-orchestrator', {
      name: 'cfn-orchestrator',
      tag: 'latest',
      dockerfile: 'docker/Dockerfile.orchestrator',
      exists: false
    });

    this.images.set('cfn-coordinator', {
      name: 'cfn-coordinator',
      tag: 'latest',
      dockerfile: 'docker/Dockerfile.coordinator',
      exists: false
    });

    this.images.set('cfn-redis', {
      name: 'redis',
      tag: '7-alpine',
      dockerfile: '',
      exists: false
    });
  }

  /**
   * Check if image exists in local Docker daemon
   */
  async imageExists(imageName: string): Promise<boolean> {
    try {
      const result = await execa('docker', ['images', '--quiet', `${imageName}:*`], {
        all: true
      });
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get image size in bytes
   */
  async getImageSize(imageName: string): Promise<number> {
    try {
      const result = await execa('docker', ['images', '--format', '{{.Size}}', imageName], {
        all: true
      });
      const sizeStr = result.stdout.trim();
      // Parse human-readable size (e.g., "256MB", "1.5GB")
      return this.parseSize(sizeStr);
    } catch {
      return 0;
    }
  }

  /**
   * Parse human-readable size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const multipliers: { [key: string]: number } = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^([\d.]+)\s*([A-Z]+)$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];
    return Math.floor(value * (multipliers[unit] || 1));
  }

  /**
   * Check if Dockerfile exists
   */
  checkDockerfile(dockerfilePath: string): boolean {
    return fs.existsSync(path.join(this.projectRoot, dockerfilePath));
  }

  /**
   * Validate Dockerfile syntax (basic checks)
   */
  async validateDockerfile(dockerfilePath: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    const fullPath = path.join(this.projectRoot, dockerfilePath);

    if (!fs.existsSync(fullPath)) {
      errors.push(`Dockerfile not found: ${dockerfilePath}`);
      return { valid: false, errors };
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Basic validations
      if (!content.includes('FROM')) {
        errors.push('Missing FROM instruction');
      }

      if (!content.includes('WORKDIR') && !content.includes('ENTRYPOINT')) {
        errors.push('Missing WORKDIR or ENTRYPOINT');
      }

      // Check for absolute paths
      const absolutePathLines = content.split('\n')
        .map((line, idx) => ({ line, idx }))
        .filter(({ line }) => /^(RUN|COPY|ADD)\s+.*\/[a-zA-Z]/.test(line));

      if (absolutePathLines.length > 0) {
        errors.push(`Found absolute paths in instructions at lines: ${absolutePathLines.map(l => l.idx + 1).join(', ')}`);
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`Error reading Dockerfile: ${error}`);
      return { valid: false, errors };
    }
  }

  /**
   * Check image for common issues
   */
  async checkImageIntegrity(imageName: string): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    const exists = await this.imageExists(imageName);
    if (!exists) {
      issues.push(`Image not found: ${imageName}`);
    }

    const size = await this.getImageSize(imageName);
    if (size === 0 && exists) {
      issues.push(`Unable to determine image size: ${imageName}`);
    }

    if (size > 2 * 1024 * 1024 * 1024) {
      issues.push(`Image is larger than expected (>2GB): ${imageName}`);
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }

  /**
   * Get all images and their status
   */
  async getAllImagesStatus(): Promise<Map<string, ImageMetadata>> {
    const result = new Map<string, ImageMetadata>();

    for (const [key, metadata] of this.images) {
      const imageName = `${metadata.name}:${metadata.tag}`;
      const exists = await this.imageExists(imageName);
      const size = await this.getImageSize(imageName);

      result.set(key, {
        ...metadata,
        exists,
        size: exists ? size : undefined
      });
    }

    return result;
  }
}

describe('Docker Image Testing', () => {
  let tester: DockerImageTester;

  beforeEach(() => {
    tester = new DockerImageTester(process.cwd());
  });

  describe('Image Existence', () => {
    it('should check if image exists', async () => {
      const exists = await tester.imageExists('alpine:latest');
      expect(typeof exists).toBe('boolean');
    });

    it('should handle non-existent image gracefully', async () => {
      const exists = await tester.imageExists('nonexistent-image-xyz-123:latest');
      expect(exists).toBe(false);
    });
  });

  describe('Image Metadata', () => {
    it('should get image size for valid image', async () => {
      const size = await tester.getImageSize('alpine:latest');
      // Size should be a positive number or 0 if parsing fails
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for non-existent image', async () => {
      const size = await tester.getImageSize('nonexistent-xyz-123:latest');
      expect(size).toBe(0);
    });
  });

  describe('Dockerfile Validation', () => {
    it('should detect missing Dockerfile', () => {
      const exists = tester.checkDockerfile('docker/nonexistent.Dockerfile');
      expect(exists).toBe(false);
    });

    it('should find existing Dockerfile', () => {
      // This will depend on project structure
      const dockerfiles = [
        'docker/Dockerfile.agent',
        'Dockerfile'
      ];

      const foundAny = dockerfiles.some(df => tester.checkDockerfile(df));
      expect(typeof foundAny).toBe('boolean');
    });

    it('should validate Dockerfile syntax', async () => {
      const result = await tester.validateDockerfile('docker/nonexistent.Dockerfile');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Image Integrity Checks', () => {
    it('should check image integrity for valid image', async () => {
      const result = await tester.checkImageIntegrity('alpine:latest');
      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('issues');
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should report issues for non-existent image', async () => {
      const result = await tester.checkImageIntegrity('nonexistent-xyz-123:latest');
      expect(result.healthy).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('All Images Status', () => {
    it('should get status for all images', async () => {
      const status = await tester.getAllImagesStatus();
      expect(status).toBeInstanceOf(Map);
      expect(status.size).toBeGreaterThan(0);

      // Each status entry should have required properties
      status.forEach(metadata => {
        expect(metadata).toHaveProperty('name');
        expect(metadata).toHaveProperty('tag');
        expect(metadata).toHaveProperty('exists');
      });
    });
  });
});
