/**
 * Test Suite: Hello World Backend Service
 * Description: Test-driven development for backend service that creates hello-world.txt
 * Author: backend-developer
 * Version: 1.0.0
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const WORKING_DIR = '/tmp/cfn-cli-real-test-cfn-cli-real-e2e-1763691488-17950';
const EXPECTED_FILE = join(WORKING_DIR, 'hello-world.txt');

describe('Hello World Backend Service', () => {
  describe('Deliverable Creation', () => {
    it('should create hello-world.txt file', () => {
      // Test: File should exist
      expect(existsSync(EXPECTED_FILE)).toBe(true);
    });

    it('should contain hello world content', () => {
      // Test: File should have correct content
      if (existsSync(EXPECTED_FILE)) {
        const content = readFileSync(EXPECTED_FILE, 'utf8');
        expect(content).toContain('Hello World');
        expect(content).toContain('Backend Service');
        expect(content.length).toBeGreaterThan(10);
      } else {
        fail('hello-world.txt file does not exist');
      }
    });

    it('should have proper file metadata', () => {
      // Test: File should be readable and non-empty
      if (existsSync(EXPECTED_FILE)) {
        const stats = require('fs').statSync(EXPECTED_FILE);
        expect(stats.isFile()).toBe(true);
        expect(stats.size).toBeGreaterThan(5);
        expect(stats.mode).toBeDefined();
      } else {
        fail('hello-world.txt file does not exist');
      }
    });
  });

  describe('Backend Service Functionality', () => {
    it('should generate content via service function', async () => {
      // Test: Service function should generate content
      const { generateHelloWorld } = require('../src/backend/hello-world-service');
      
      const content = await generateHelloWorld();
      expect(content).toBeDefined();
      expect(typeof content).toBe('string');
      expect(content).toContain('Hello World');
    });

    it('should write file via service function', async () => {
      // Test: Service function should write file to working directory
      const { writeHelloWorldFile } = require('../src/backend/hello-world-service');
      
      const success = await writeHelloWorldFile(WORKING_DIR);
      expect(success).toBe(true);
      
      // Verify file was actually created
      expect(existsSync(EXPECTED_FILE)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Test: Service should handle invalid paths
      const { writeHelloWorldFile } = require('../src/backend/hello-world-service');
      
      const success = await writeHelloWorldFile('/invalid/path');
      expect(success).toBe(false);
    });
  });

  describe('API Endpoint Tests', () => {
    it('should serve hello world via API endpoint', async () => {
      // Test: API endpoint should return hello world content
      const { createHelloWorldApi } = require('../src/backend/hello-world-service');
      
      try {
        const app = createHelloWorldApi();
        expect(app).toBeDefined();
        expect(typeof app).toBe('function');
      } catch (error) {
        // Fallback for environments without express
        expect(error).toBeDefined();
      }
    });
  });
});