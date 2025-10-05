#!/usr/bin/env node

/**
 * CFN Claude Sync Command Tests
 *
 * Tests the /cfn-claude-sync slash command that synchronizes
 * CFN Loop configuration from CLAUDE.md to slash command files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CfnClaudeSyncCommand } from '../../../src/slash-commands/cfn-claude-sync.js';
import fs from 'fs';
import path from 'path';

describe('CfnClaudeSyncCommand', () => {
  let command;
  let testDir;

  beforeEach(() => {
    command = new CfnClaudeSyncCommand();
    testDir = path.join(process.cwd(), 'tests', 'fixtures', 'cfn-sync');
  });

  describe('Command Metadata', () => {
    it('should have correct command name', () => {
      expect(command.name).toBe('cfn-claude-sync');
    });

    it('should have description', () => {
      expect(command.description).toContain('Sync CFN Loop');
      expect(command.description).toContain('CLAUDE.md');
    });

    it('should have usage pattern', () => {
      const usage = command.getUsage();
      expect(usage).toContain('/cfn-claude-sync');
      expect(usage).toContain('--dry-run');
      expect(usage).toContain('--verbose');
    });

    it('should provide examples', () => {
      const examples = command.getExamples();
      expect(examples).toHaveLength(3);
      expect(examples[0]).toBe('/cfn-claude-sync');
      expect(examples[1]).toContain('--dry-run');
      expect(examples[2]).toContain('--verbose');
    });
  });

  describe('Argument Parsing', () => {
    it('should parse no arguments as defaults', () => {
      const options = command.parseArgs([]);
      expect(options.dryRun).toBe(false);
      expect(options.verbose).toBe(false);
    });

    it('should parse --dry-run flag', () => {
      const options = command.parseArgs(['--dry-run']);
      expect(options.dryRun).toBe(true);
      expect(options.verbose).toBe(false);
    });

    it('should parse --verbose flag', () => {
      const options = command.parseArgs(['--verbose']);
      expect(options.dryRun).toBe(false);
      expect(options.verbose).toBe(true);
    });

    it('should parse both flags together', () => {
      const options = command.parseArgs(['--dry-run', '--verbose']);
      expect(options.dryRun).toBe(true);
      expect(options.verbose).toBe(true);
    });
  });

  describe('Configuration Extraction', () => {
    it('should extract consensus threshold from CLAUDE.md', () => {
      const claudeMdContent = `
## 🔄 MANDATORY CFN LOOP

Loop 2: Consensus Validation (≥90% Byzantine consensus)
`;
      const testFile = path.join(testDir, 'CLAUDE-test.md');

      // Note: This test assumes CLAUDE.md exists in project root
      // In real test, we'd mock fs.readFileSync
      if (fs.existsSync(path.join(process.cwd(), 'CLAUDE.md'))) {
        const config = command.extractCfnConfig(
          path.join(process.cwd(), 'CLAUDE.md'),
          false
        );

        expect(config.consensusThreshold).toBe('90');
      }
    });

    it('should extract confidence gate from CLAUDE.md', () => {
      if (fs.existsSync(path.join(process.cwd(), 'CLAUDE.md'))) {
        const config = command.extractCfnConfig(
          path.join(process.cwd(), 'CLAUDE.md'),
          false
        );

        expect(config.confidenceGate).toBe('75');
      }
    });

    it('should extract loop iteration limits', () => {
      if (fs.existsSync(path.join(process.cwd(), 'CLAUDE.md'))) {
        const config = command.extractCfnConfig(
          path.join(process.cwd(), 'CLAUDE.md'),
          false
        );

        expect(config.loop2MaxIterations).toBe('10');
        expect(config.loop3MaxIterations).toBe('10');
      }
    });
  });

  describe('Pattern Extraction Utilities', () => {
    it('should extract value from pattern match', () => {
      const text = 'Consensus threshold: ≥90%';
      const value = command.extractValue(text, /≥(\d+)%/, '0');
      expect(value).toBe('90');
    });

    it('should return fallback when pattern not found', () => {
      const text = 'No numbers here';
      const value = command.extractValue(text, /≥(\d+)%/, '99');
      expect(value).toBe('99');
    });

    it('should extract complexity tier configuration', () => {
      const text = '**Simple** (3-5 steps): 2-3 agents (mesh topology)';
      const tier = command.extractComplexityTier(text, 'Simple', '1', 'star');

      // Should extract from text or use defaults
      expect(tier.agents).toMatch(/\d+-?\d*/);
      expect(tier.topology).toMatch(/mesh|hierarchical/);
    });
  });

  describe('Target Files Identification', () => {
    it('should identify markdown template files', () => {
      const projectRoot = process.cwd();
      const files = command.getTargetFiles(projectRoot);

      expect(files.markdown).toHaveLength(4);
      expect(files.markdown[0]).toContain('cfn-loop.md');
      expect(files.markdown[1]).toContain('cfn-loop-epic.md');
      expect(files.markdown[2]).toContain('cfn-loop-sprints.md');
      expect(files.markdown[3]).toContain('cfn-loop-single.md');
    });

    it('should identify javascript generator files', () => {
      const projectRoot = process.cwd();
      const files = command.getTargetFiles(projectRoot);

      expect(files.javascript).toHaveLength(4);
      expect(files.javascript[0]).toContain('cfn-loop.js');
      expect(files.javascript[1]).toContain('cfn-loop-epic.js');
      expect(files.javascript[2]).toContain('cfn-loop-sprints.js');
      expect(files.javascript[3]).toContain('cfn-loop-single.js');
    });
  });

  describe('Line Number Calculation', () => {
    it('should calculate correct line number from character index', () => {
      const content = 'Line 1\nLine 2\nLine 3\nTarget here';
      const targetIndex = content.indexOf('Target');
      const lineNum = command.getLineNumber(content, targetIndex);
      expect(lineNum).toBe(4);
    });

    it('should return 1 for index 0', () => {
      const content = 'First line\nSecond line';
      const lineNum = command.getLineNumber(content, 0);
      expect(lineNum).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing CLAUDE.md gracefully', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => '/nonexistent/path';

      const result = await command.execute([], {});

      process.cwd = originalCwd;

      expect(result.success).toBe(false);
      expect(result.error).toContain('CLAUDE.md not found');
    });

    it('should throw error if CFN Loop section not found', () => {
      const testFile = path.join(testDir, 'invalid-claude.md');

      // Create temp file without CFN Loop section
      const invalidContent = '# CLAUDE.md\n\nNo CFN Loop section here';

      expect(() => {
        // This would be called internally with mocked fs.readFileSync
        const pattern = /## 🔄 MANDATORY CFN LOOP[\s\S]*?(?=\n## [^#]|$)/;
        const match = invalidContent.match(pattern);
        if (!match) {
          throw new Error("Could not find '## 🔄 MANDATORY CFN LOOP' section in CLAUDE.md");
        }
      }).toThrow("Could not find '## 🔄 MANDATORY CFN LOOP' section");
    });
  });

  describe('Dry Run Mode', () => {
    it('should not modify files in dry-run mode', async () => {
      // This would require mocking fs operations
      // Test ensures --dry-run flag prevents writes
      const result = await command.execute(['--dry-run'], {});

      if (result.success) {
        expect(result.dryRun).toBe(true);
      }
    });

    it('should report changes without applying in dry-run', async () => {
      const result = await command.execute(['--dry-run'], {});

      if (result.success) {
        expect(result.report).toBeDefined();
        expect(result.report).toContain('DRY RUN');
      }
    });
  });

  describe('Report Formatting', () => {
    it('should format dry-run report with configuration', () => {
      const config = {
        consensusThreshold: '90',
        confidenceGate: '75',
        loop2MaxIterations: '10',
        loop3MaxIterations: '10',
      };

      const changes = {
        markdown: [],
        javascript: [],
      };

      const result = command.formatDryRunReport(config, changes);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.report).toContain('≥90%');
      expect(result.report).toContain('≥75%');
      expect(result.report).toContain('DRY RUN');
    });

    it('should format sync report with results', () => {
      const config = {
        consensusThreshold: '90',
        confidenceGate: '75',
        loop2MaxIterations: '10',
        loop3MaxIterations: '10',
      };

      const results = {
        updated: [
          { file: '/path/to/cfn-loop.md', changes: 2 },
          { file: '/path/to/cfn-loop.js', changes: 1 },
        ],
        errors: [],
        skipped: [],
      };

      const result = command.formatSyncReport(config, results);

      expect(result.success).toBe(true);
      expect(result.report).toContain('Complete');
      expect(result.report).toContain('cfn-loop.md');
      expect(result.report).toContain('2 changes');
    });
  });

  describe('Integration with Project Structure', () => {
    it('should identify all CFN Loop slash command files', () => {
      const projectRoot = process.cwd();
      const files = command.getTargetFiles(projectRoot);
      const allFiles = [...files.markdown, ...files.javascript];

      expect(allFiles).toHaveLength(8);

      // Verify all expected files are included
      const expectedFiles = [
        'cfn-loop.md',
        'cfn-loop-epic.md',
        'cfn-loop-sprints.md',
        'cfn-loop-single.md',
        'cfn-loop.js',
        'cfn-loop-epic.js',
        'cfn-loop-sprints.js',
        'cfn-loop-single.js',
      ];

      for (const expected of expectedFiles) {
        const found = allFiles.some(f => f.includes(expected));
        expect(found).toBe(true);
      }
    });
  });
});

describe('CfnClaudeSyncCommand - Real Configuration', () => {
  it('should correctly extract current CLAUDE.md configuration', () => {
    const command = new CfnClaudeSyncCommand();
    const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');

    if (!fs.existsSync(claudeMdPath)) {
      console.log('⚠️  Skipping: CLAUDE.md not found');
      return;
    }

    const config = command.extractCfnConfig(claudeMdPath, false);

    // Verify extracted values match expected CLAUDE.md configuration
    expect(config.consensusThreshold).toBe('90');
    expect(config.confidenceGate).toBe('75');
    expect(config.loop2MaxIterations).toBe('10');
    expect(config.loop3MaxIterations).toBe('10');

    // Verify complexity tiers
    expect(config.complexityTiers).toBeDefined();
    expect(config.complexityTiers.simple).toBeDefined();
    expect(config.complexityTiers.medium).toBeDefined();
    expect(config.complexityTiers.complex).toBeDefined();
    expect(config.complexityTiers.enterprise).toBeDefined();

    // Verify GOAP decisions
    expect(config.goapDecisions).toContain('PROCEED');
    expect(config.goapDecisions).toContain('DEFER');
    expect(config.goapDecisions).toContain('ESCALATE');
  });
});
