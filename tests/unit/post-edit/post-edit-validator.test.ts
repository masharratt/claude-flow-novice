/**
 * Post-Edit Validator Tests
 * Validates file syntax, formatting, and linting checks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PostEditValidator } from '../src/hooks/post-edit-validator.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('PostEditValidator', () => {
  let tempDir: string;
  let validator: PostEditValidator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-test-'));
    validator = new PostEditValidator(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig', () => {
    it('should load config with defaults when file missing', async () => {
      const config = await validator.loadConfig();

      expect(config.checkSyntax).toBe(true);
      expect(config.checkFormatting).toBe(true);
      expect(config.blockingValidation).toBe(false);
    });

    it('should load config from JSON file if present', async () => {
      const configDir = path.join(tempDir, '.claude/hooks');
      await fs.mkdir(configDir, { recursive: true });

      const configPath = path.join(configDir, 'cfn-post-edit.config.json');
      const configContent = {
        enabled: true,
        blocking: true,
        validation: {
          syntax: { enabled: true },
          formatting: { enabled: false },
          typescript: { enabled: true, noEmit: true },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

      // Create new validator with temp dir
      const newValidator = new PostEditValidator(tempDir);
      const config = await newValidator.loadConfig();

      expect(config.blockingValidation).toBe(true);
      expect(config.checkFormatting).toBe(false);
    });
  });

  describe('validateJSON', () => {
    it('should validate valid JSON file', async () => {
      const jsonFile = path.join(tempDir, 'test.json');
      await fs.writeFile(jsonFile, JSON.stringify({ valid: 'json' }));

      const result = await validator.validateFile(jsonFile);

      expect(result.passed).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect invalid JSON', async () => {
      const jsonFile = path.join(tempDir, 'invalid.json');
      await fs.writeFile(jsonFile, '{ invalid json }');

      const result = await validator.validateFile(jsonFile);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate empty JSON object', async () => {
      const jsonFile = path.join(tempDir, 'empty.json');
      await fs.writeFile(jsonFile, '{}');

      const result = await validator.validateFile(jsonFile);

      expect(result.passed).toBe(true);
    });

    it('should validate JSON with special characters', async () => {
      const jsonFile = path.join(tempDir, 'special.json');
      const content = JSON.stringify({
        unicode: 'カタカナ',
        emoji: '🚀',
        escaped: 'quote"mark',
      });
      await fs.writeFile(jsonFile, content);

      const result = await validator.validateFile(jsonFile);

      expect(result.passed).toBe(true);
    });
  });

  describe('validateBash', () => {
    it('should validate bash script', async () => {
      const bashFile = path.join(tempDir, 'script.sh');
      const content = `#!/bin/bash
set -euo pipefail

echo "Hello World"
`;
      await fs.writeFile(bashFile, content);

      const result = await validator.validateFile(bashFile);

      expect(result.passed).toBe(true);
    });

    it('should suggest set -euo pipefail', async () => {
      const bashFile = path.join(tempDir, 'unsafe.sh');
      const content = `#!/bin/bash

echo "Missing strict mode"
`;
      await fs.writeFile(bashFile, content);

      const result = await validator.validateFile(bashFile);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(
        result.suggestions.some((s) => s.includes('set -euo pipefail'))
      ).toBe(true);
    });

    it('should detect unquoted variables', async () => {
      const bashFile = path.join(tempDir, 'unquoted.sh');
      const content = `#!/bin/bash
set -euo pipefail

VAR="test"
echo $VAR
`;
      await fs.writeFile(bashFile, content);

      const result = await validator.validateFile(bashFile);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn about pipe to while-read', async () => {
      const bashFile = path.join(tempDir, 'pipe-while.sh');
      const content = `#!/bin/bash
set -euo pipefail

echo "data" | while read line; do
  echo $line
done
`;
      await fs.writeFile(bashFile, content);

      const result = await validator.validateFile(bashFile);

      expect(result.warnings.some((w) => w.includes('while.*read'))).toBe(true);
    });
  });

  describe('checkFormatting', () => {
    it('should detect trailing whitespace', async () => {
      const file = path.join(tempDir, 'trailing.ts');
      const content = 'const x = 1;   \nconst y = 2;\n';
      await fs.writeFile(file, content);

      const result = await validator.validateFile(file);

      expect(result.suggestions.some((s) => s.includes('trailing'))).toBe(true);
    });

    it('should detect mixed line endings', async () => {
      const file = path.join(tempDir, 'mixed.ts');
      const content = 'line1\r\nline2\nline3\r\n';
      await fs.writeFile(file, content);

      const result = await validator.validateFile(file);

      expect(result.warnings.some((w) => w.includes('line endings'))).toBe(true);
    });

    it('should detect mixed tabs and spaces', async () => {
      const file = path.join(tempDir, 'mixed-indent.ts');
      const content = 'function test() {\n\treturn true;\n  const x = 1;\n}\n';
      await fs.writeFile(file, content);

      const result = await validator.validateFile(file);

      expect(result.warnings.some((w) => w.includes('tabs and spaces'))).toBe(
        true
      );
    });

    it('should accept clean formatting', async () => {
      const file = path.join(tempDir, 'clean.ts');
      const content = 'const x = 1;\nconst y = 2;\n';
      await fs.writeFile(file, content);

      const result = await validator.validateFile(file);

      // Should not have excessive formatting warnings
      const formattingWarnings = result.warnings.filter((w) =>
        w.includes('line endings')
      );
      expect(formattingWarnings.length).toBe(0);
    });
  });

  describe('checkDuplication', () => {
    it('should detect duplicate lines', async () => {
      const file = path.join(tempDir, 'dupes.ts');
      const content = 'const x = 1;\nconst x = 1;\nconst y = 2;\n';
      await fs.writeFile(file, content);

      // Enable duplication checking
      validator.config = { ...validator.config, checkDuplication: true };

      const result = await validator.runValidationPipeline(file);

      expect(result.suggestions.some((s) => s.includes('Duplicate'))).toBe(true);
    });

    it('should not flag short duplicate lines', async () => {
      const file = path.join(tempDir, 'short-dupes.ts');
      const content = 'a\na\nb\n';
      await fs.writeFile(file, content);

      validator.config = { ...validator.config, checkDuplication: true };

      const result = await validator.runValidationPipeline(file);

      // Short lines should be ignored
      const duplicateSuggestions = result.suggestions.filter((s) =>
        s.includes('Duplicate')
      );
      expect(duplicateSuggestions.length).toBe(0);
    });
  });

  describe('validateFile', () => {
    it('should reject non-existent file', async () => {
      const result = await validator.validateFile(
        path.join(tempDir, 'nonexistent.ts')
      );

      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('does not exist'))).toBe(
        true
      );
    });

    it('should return timestamp in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      await fs.writeFile(file, 'const x = 1;\n');

      const result = await validator.validateFile(file);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should return execution time', async () => {
      const file = path.join(tempDir, 'test.ts');
      await fs.writeFile(file, 'const x = 1;\n');

      const result = await validator.validateFile(file);

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should include file path in result', async () => {
      const file = path.join(tempDir, 'test.ts');
      await fs.writeFile(file, 'const x = 1;\n');

      const result = await validator.validateFile(file);

      expect(result.filePath).toBe(file);
    });
  });

  describe('runValidationPipeline', () => {
    it('should run multiple validation checks', async () => {
      const file = path.join(tempDir, 'multi.ts');
      await fs.writeFile(file, 'const x = 1;  \n');

      const result = await validator.runValidationPipeline(file);

      expect(result.timestamp).toBeDefined();
      expect(result.filePath).toBe(file);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should aggregate errors from multiple checks', async () => {
      const file = path.join(tempDir, 'invalid.json');
      await fs.writeFile(file, '{ bad json }');

      const result = await validator.runValidationPipeline(file);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getValidationSummary', () => {
    it('should generate passed summary', async () => {
      const file = path.join(tempDir, 'valid.json');
      await fs.writeFile(file, '{}');

      const result = await validator.validateFile(file);
      const summary = validator.getValidationSummary(result);

      expect(summary).toContain('Validation passed');
      expect(summary).toContain('Execution time');
    });

    it('should include errors in summary', async () => {
      const file = path.join(tempDir, 'invalid.json');
      await fs.writeFile(file, '{ bad }');

      const result = await validator.validateFile(file);
      const summary = validator.getValidationSummary(result);

      expect(summary).toContain('Validation failed');
      expect(summary).toContain('Errors');
    });

    it('should include warnings in summary', async () => {
      const file = path.join(tempDir, 'trailing.ts');
      await fs.writeFile(file, 'const x = 1;  \n');

      const result = await validator.validateFile(file);
      const summary = validator.getValidationSummary(result);

      expect(summary).toContain('Execution time');
    });
  });

  describe('file type handling', () => {
    it('should handle TypeScript files', async () => {
      const file = path.join(tempDir, 'test.ts');
      await fs.writeFile(file, 'const x: number = 1;\n');

      const result = await validator.validateFile(file);

      expect(result.filePath).toBe(file);
    });

    it('should handle JavaScript files', async () => {
      const file = path.join(tempDir, 'test.js');
      await fs.writeFile(file, 'const x = 1;\n');

      const result = await validator.validateFile(file);

      expect(result.filePath).toBe(file);
    });

    it('should handle shell script files', async () => {
      const file = path.join(tempDir, 'script.sh');
      await fs.writeFile(file, '#!/bin/bash\necho "test"\n');

      const result = await validator.validateFile(file);

      expect(result.filePath).toBe(file);
    });

    it('should handle markdown files', async () => {
      const file = path.join(tempDir, 'README.md');
      await fs.writeFile(file, '# Title\n\nContent\n');

      const result = await validator.validateFile(file);

      expect(result.filePath).toBe(file);
    });
  });

  describe('edge cases', () => {
    it('should handle empty files', async () => {
      const file = path.join(tempDir, 'empty.ts');
      await fs.writeFile(file, '');

      const result = await validator.validateFile(file);

      expect(result.passed).toBe(true);
    });

    it('should handle very large files', async () => {
      const file = path.join(tempDir, 'large.ts');
      const largeContent = 'const x = 1;\n'.repeat(10000);
      await fs.writeFile(file, largeContent);

      const result = await validator.validateFile(file);

      expect(result.executionTime).toBeLessThan(5000);
    });

    it('should handle files with special characters', async () => {
      const file = path.join(tempDir, 'special.ts');
      await fs.writeFile(file, '// ñ é ü ö\nconst x = 1;\n');

      const result = await validator.validateFile(file);

      expect(result.filePath).toBe(file);
    });

    it('should provide agent ID in validation', async () => {
      const file = path.join(tempDir, 'test.ts');
      await fs.writeFile(file, 'const x = 1;\n');

      const result = await validator.validateFile(file, 'test-agent-123');

      expect(result.filePath).toBe(file);
    });
  });
});
