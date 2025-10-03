/**
 * Unit tests for MarkdownUpdater
 *
 * Tests markdown parsing, status updates, backup/rollback, and validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  MarkdownUpdater,
  StatusEmoji,
  StatusUpdate,
  createMarkdownUpdater,
  updateSprintStatusHook,
  updatePhaseStatusHook,
} from '../../src/utils/markdown-updater.js';
import { Logger } from '../../src/core/logger.js';

// ===== TEST FIXTURES =====

const PHASE_OVERVIEW_CONTENT = `
# Agent Coordination System V2 - Phase Overview

## Current Status (2025-10-02)

| Phase | Status | Completion | Blocker |
|-------|--------|------------|---------|
| **Phase 0** | ⏳ Pending | 0% | None - ready to start |
| **Phase 1** | ⏳ Pending | 0% | Phase 0 |
| **Phase 2** | ⏳ Pending | 0% | Phase 1 |
`;

const SPRINT_FILE_CONTENT = `
# PHASE 00: SDK Foundation Setup

## Success Criteria

### Binary Completion Checklist
- [ ] **SDK installed and configured** (\`@anthropic-ai/claude-code\` dependency added)
- [ ] **Agent Spawning Performance**: Spawn 20 agents in <2s (vs 20s sequential baseline)
- [ ] **Pause/Resume Latency**: Zero token cost pausing with <50ms resume time
- [ ] **Checkpoint Recovery Time**: Restore state in <500ms from message UUID

## Sprints

- [ ] ❌ **Sprint 1.1**: SDK Foundation (Not Started)
- [ ] ❌ **Sprint 1.2**: Query Controller (Not Started)
- [ ] ❌ **Sprint 1.3**: Checkpoint Manager (Not Started)
`;

const PHASE_FILE_CONTENT = `
# Phase 1: Core Authentication System

**Phase ID**: \`phase-1-core-auth\`
**Epic**: \`auth-system-v2\`
**Status**: ❌ Not Started
**Dependencies**: None
**Estimated Duration**: 1 week

## Phase Description

Implement foundational JWT-based authentication system.

## Sprint Breakdown

### Sprint 1.1: User Registration & Password Security
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: None

### Sprint 1.2: JWT Token Generation
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 1.1

### Sprint 1.3: Login Endpoint & Token Validation
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 1.1, Sprint 1.2
`;

// ===== TEST SETUP =====

describe('MarkdownUpdater', () => {
  let tempDir: string;
  let testFilePath: string;
  let backupDir: string;
  let logger: Logger;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(process.cwd(), '.test-tmp', `markdown-updater-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    backupDir = path.join(tempDir, 'backups');
    testFilePath = path.join(tempDir, 'test.md');

    // Create logger
    logger = new Logger(
      { level: 'error', format: 'json', destination: 'console' },
      { component: 'MarkdownUpdaterTest' }
    );
  });

  afterEach(async () => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  // ===== INITIALIZATION TESTS =====

  describe('Initialization', () => {
    it('should create updater with default config', () => {
      const updater = createMarkdownUpdater();
      expect(updater).toBeInstanceOf(MarkdownUpdater);
    });

    it('should create updater with custom config', () => {
      const updater = createMarkdownUpdater({
        enableBackup: false,
        backupDir,
        validateAfterUpdate: true,
        logger,
      });

      expect(updater).toBeInstanceOf(MarkdownUpdater);
    });
  });

  // ===== PARSING TESTS =====

  describe('Markdown Parsing', () => {
    it('should parse phase overview table rows', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_OVERVIEW_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'Phase 0', newStatus: StatusEmoji.IN_PROGRESS },
      ]);

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(1);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('| **Phase 0** | 🔄');
    });

    it('should parse sprint list items', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.IN_PROGRESS },
      ]);

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(1);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('🔄 **Sprint 1.1**');
    });

    it('should parse checklist items', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'SDK installed and configured', newStatus: StatusEmoji.COMPLETE },
      ]);

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(1);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('- [x] **SDK installed and configured**');
    });

    it('should handle multiple sections in single update', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const updates: StatusUpdate[] = [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.IN_PROGRESS },
        { sectionId: 'Sprint 1.2', newStatus: StatusEmoji.IN_PROGRESS },
        { sectionId: 'Sprint 1.3', newStatus: StatusEmoji.COMPLETE },
      ];

      const result = await updater.updateStatus(testFilePath, updates);

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(3);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('🔄 **Sprint 1.1**');
      expect(content).toContain('🔄 **Sprint 1.2**');
      expect(content).toContain('✅ **Sprint 1.3**');
    });
  });

  // ===== STATUS UPDATE TESTS =====

  describe('Status Updates', () => {
    it('should update status from NOT_STARTED to IN_PROGRESS', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateSprintStatus(
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.IN_PROGRESS
      );

      expect(result.success).toBe(true);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('🔄 **Sprint 1.1**');
      expect(content).not.toContain('❌ **Sprint 1.1**');
    });

    it('should update status from IN_PROGRESS to COMPLETE', async () => {
      const inProgressContent = SPRINT_FILE_CONTENT.replace(
        '❌ **Sprint 1.1**',
        '🔄 **Sprint 1.1**'
      );
      await fs.promises.writeFile(testFilePath, inProgressContent, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateSprintStatus(
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.COMPLETE
      );

      expect(result.success).toBe(true);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('✅ **Sprint 1.1**');
      expect(content).not.toContain('🔄 **Sprint 1.1**');
    });

    it('should update phase status with completion percentage', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_OVERVIEW_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updatePhaseStatus(
        testFilePath,
        'Phase 0',
        StatusEmoji.IN_PROGRESS,
        50
      );

      expect(result.success).toBe(true);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('| **Phase 0** | 🔄');
      expect(content).toContain('| 50% |');
    });

    it('should update checklist completion state', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'Agent Spawning Performance', newStatus: StatusEmoji.COMPLETE },
      ]);

      expect(result.success).toBe(true);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('- [x] **Agent Spawning Performance**');
    });

    it('should warn on section not found', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'NonExistentSection', newStatus: StatusEmoji.COMPLETE },
      ]);

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(0);
      expect(result.warnings).toContain('Section not found: NonExistentSection');
    });
  });

  // ===== BACKUP/ROLLBACK TESTS =====

  describe('Backup and Rollback', () => {
    it('should create backup when enabled', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: true });

      const result = await updater.updateSprintStatus(
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.IN_PROGRESS
      );

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);

      // Verify backup content
      const backupContent = await fs.promises.readFile(result.backupPath!, 'utf-8');
      expect(backupContent).toContain('❌ **Sprint 1.1**');
    });

    it('should not create backup when disabled', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateSprintStatus(
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.IN_PROGRESS
      );

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeUndefined();
    });

    it('should rollback on validation failure', async () => {
      // Create invalid markdown that will fail validation
      const invalidContent = SPRINT_FILE_CONTENT + '\n\n[unclosed bracket';
      await fs.promises.writeFile(testFilePath, invalidContent, 'utf-8');

      const updater = createMarkdownUpdater({
        logger,
        backupDir,
        enableBackup: true,
        validateAfterUpdate: true,
      });

      // Force validation failure by corrupting the file
      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.IN_PROGRESS },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Verify rollback happened
      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toBe(invalidContent);
    });
  });

  // ===== VALIDATION TESTS =====

  describe('Markdown Validation', () => {
    it('should validate markdown structure', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({
        logger,
        backupDir,
        enableBackup: false,
        validateAfterUpdate: true,
      });

      const result = await updater.updateSprintStatus(
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.IN_PROGRESS
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect unmatched brackets', async () => {
      const invalidContent = '# Test\n\n[unclosed bracket\n\nSome text';
      await fs.promises.writeFile(testFilePath, invalidContent, 'utf-8');

      const updater = createMarkdownUpdater({
        logger,
        backupDir,
        enableBackup: true,
        validateAfterUpdate: true,
      });

      const result = await updater.updateStatus(testFilePath, []);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Unmatched brackets'))).toBe(true);
    });

    it('should skip validation when disabled', async () => {
      const invalidContent = '# Test\n\n[unclosed bracket';
      await fs.promises.writeFile(testFilePath, invalidContent, 'utf-8');

      const updater = createMarkdownUpdater({
        logger,
        backupDir,
        enableBackup: false,
        validateAfterUpdate: false,
      });

      const result = await updater.updateStatus(testFilePath, []);

      expect(result.success).toBe(true);
    });
  });

  // ===== ERROR HANDLING TESTS =====

  describe('Error Handling', () => {
    it('should handle non-existent file', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.md');

      const updater = createMarkdownUpdater({ logger, backupDir });

      const result = await updater.updateStatus(nonExistentPath, [
        { sectionId: 'Test', newStatus: StatusEmoji.COMPLETE },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('does not exist'))).toBe(true);
    });

    it('should handle write errors gracefully', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      // Make file read-only to trigger write error
      await fs.promises.chmod(testFilePath, 0o444);

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.IN_PROGRESS },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Restore permissions for cleanup
      await fs.promises.chmod(testFilePath, 0o644);
    });
  });

  // ===== INTEGRATION HELPER TESTS =====

  describe('Integration Helpers', () => {
    it('updateSprintStatusHook should update sprint', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      await updateSprintStatusHook(
        updater,
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.IN_PROGRESS
      );

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('🔄 **Sprint 1.1**');
    });

    it('updatePhaseStatusHook should update phase', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_OVERVIEW_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      await updatePhaseStatusHook(
        updater,
        testFilePath,
        'Phase 0',
        StatusEmoji.IN_PROGRESS,
        50
      );

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('| **Phase 0** | 🔄');
      expect(content).toContain('| 50% |');
    });

    it('integration helpers should throw on failure', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.md');

      const updater = createMarkdownUpdater({ logger, backupDir });

      await expect(
        updateSprintStatusHook(
          updater,
          nonExistentPath,
          'Sprint 1.1',
          StatusEmoji.IN_PROGRESS
        )
      ).rejects.toThrow('Failed to update sprint status');
    });
  });

  // ===== ATOMIC WRITE TESTS =====

  describe('Atomic Writes', () => {
    it('should write atomically (temp file then rename)', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateSprintStatus(
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.IN_PROGRESS
      );

      expect(result.success).toBe(true);

      // Verify no temp files remain
      const tempFiles = (await fs.promises.readdir(tempDir)).filter(f => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should clean up temp file on write error', async () => {
      await fs.promises.writeFile(testFilePath, SPRINT_FILE_CONTENT, 'utf-8');

      // Make directory read-only to trigger write error
      await fs.promises.chmod(tempDir, 0o555);

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateStatus(testFilePath, [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.IN_PROGRESS },
      ]);

      expect(result.success).toBe(false);

      // Restore permissions
      await fs.promises.chmod(tempDir, 0o755);

      // Verify no temp files remain
      const tempFiles = (await fs.promises.readdir(tempDir)).filter(f => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });
  });

  // ===== HEADING-BASED SPRINT TESTS (NEW) =====

  describe('Heading-Based Sprint Sections', () => {
    it('should parse heading-based sprint sections', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updateSprintStatus(
        testFilePath,
        'Sprint 1.1',
        StatusEmoji.IN_PROGRESS
      );

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(1);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toContain('**Status**: 🔄 In Progress');
    });

    it('should update multiple heading-based sprints', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const updates = [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.COMPLETE },
        { sectionId: 'Sprint 1.2', newStatus: StatusEmoji.IN_PROGRESS },
        { sectionId: 'Sprint 1.3', newStatus: StatusEmoji.NOT_STARTED },
      ];

      const result = await updater.updateStatus(testFilePath, updates);

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(3);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toMatch(/### Sprint 1\.1:.*\n\*\*Status\*\*: ✅/);
      expect(content).toMatch(/### Sprint 1\.2:.*\n\*\*Status\*\*: 🔄/);
      expect(content).toMatch(/### Sprint 1\.3:.*\n\*\*Status\*\*: ❌/);
    });

    it('should preserve sprint formatting when updating', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_FILE_CONTENT, 'utf-8');

      const originalContent = await fs.promises.readFile(testFilePath, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      await updater.updateSprintStatus(testFilePath, 'Sprint 1.1', StatusEmoji.IN_PROGRESS);

      const updatedContent = await fs.promises.readFile(testFilePath, 'utf-8');

      // Verify only status emoji changed, everything else preserved
      expect(updatedContent).toContain('### Sprint 1.1: User Registration & Password Security');
      expect(updatedContent).toContain('**Duration**: 2 days');
      expect(updatedContent).toContain('**Dependencies**: None');
    });
  });

  // ===== PHASE COMPLETION CALCULATION TESTS (NEW) =====

  describe('Phase Completion Calculation', () => {
    it('should calculate phase completion with all sprints not started', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.calculatePhaseCompletion(testFilePath);

      expect(result.completionPercent).toBe(0);
      expect(result.status).toBe(StatusEmoji.NOT_STARTED);
      expect(result.sprintStatuses).toHaveLength(3);
    });

    it('should calculate phase completion with partial progress', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      // Update sprint statuses
      await updater.updateStatus(testFilePath, [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.COMPLETE },
        { sectionId: 'Sprint 1.2', newStatus: StatusEmoji.IN_PROGRESS },
      ]);

      const result = await updater.calculatePhaseCompletion(testFilePath);

      expect(result.completionPercent).toBe(33); // 1 of 3 complete
      expect(result.status).toBe(StatusEmoji.IN_PROGRESS);
      expect(result.sprintStatuses[0].status).toBe(StatusEmoji.COMPLETE);
      expect(result.sprintStatuses[1].status).toBe(StatusEmoji.IN_PROGRESS);
    });

    it('should calculate phase completion with all sprints complete', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      // Complete all sprints
      await updater.updateStatus(testFilePath, [
        { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.COMPLETE },
        { sectionId: 'Sprint 1.2', newStatus: StatusEmoji.COMPLETE },
        { sectionId: 'Sprint 1.3', newStatus: StatusEmoji.COMPLETE },
      ]);

      const result = await updater.calculatePhaseCompletion(testFilePath);

      expect(result.completionPercent).toBe(100);
      expect(result.status).toBe(StatusEmoji.COMPLETE);
    });

    it('should throw error for non-existent phase file', async () => {
      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      await expect(
        updater.calculatePhaseCompletion('/nonexistent/phase.md')
      ).rejects.toThrow('Phase file does not exist');
    });
  });

  // ===== PHASE FILE STATUS UPDATE TESTS (NEW) =====

  describe('Phase File Status Updates', () => {
    it('should update phase-level status in phase file', async () => {
      await fs.promises.writeFile(testFilePath, PHASE_FILE_CONTENT, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updatePhaseFileStatus(testFilePath, StatusEmoji.IN_PROGRESS);

      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toBe(1);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toMatch(/^\*\*Status\*\*: 🔄/m);
    });

    it('should update phase status from IN_PROGRESS to COMPLETE', async () => {
      const inProgressContent = PHASE_FILE_CONTENT.replace(
        '**Status**: ❌ Not Started',
        '**Status**: 🔄 In Progress'
      );
      await fs.promises.writeFile(testFilePath, inProgressContent, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updatePhaseFileStatus(testFilePath, StatusEmoji.COMPLETE);

      expect(result.success).toBe(true);

      const content = await fs.promises.readFile(testFilePath, 'utf-8');
      expect(content).toMatch(/^\*\*Status\*\*: ✅/m);
    });

    it('should handle missing phase status line', async () => {
      const contentWithoutStatus = `
# Phase 1: Core Authentication System

**Phase ID**: \`phase-1-core-auth\`
**Epic**: \`auth-system-v2\`
**Dependencies**: None

## Phase Description
Implement foundational JWT-based authentication system.
`;
      await fs.promises.writeFile(testFilePath, contentWithoutStatus, 'utf-8');

      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updatePhaseFileStatus(testFilePath, StatusEmoji.IN_PROGRESS);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Phase-level **Status**: line not found in file');
    });

    it('should handle non-existent phase file', async () => {
      const updater = createMarkdownUpdater({ logger, backupDir, enableBackup: false });

      const result = await updater.updatePhaseFileStatus(
        '/nonexistent/phase.md',
        StatusEmoji.IN_PROGRESS
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('does not exist');
    });
  });
});
