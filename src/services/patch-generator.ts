/**
 * Patch Generator
 * Part of Task 5.1: Edge Case Analyzer & Skill Patcher
 *
 * Generates simple patch templates for common failure patterns.
 * Phase 1 supports basic patches: error handling, null checks, type validation, timeouts, file checks.
 *
 * Features:
 * - Simple patch template generation
 * - Confidence calculation (≥0.85 threshold)
 * - Patch preview generation
 * - Integration with DatabaseService
 * - PENDING_UPDATE status for manual approval
 * - Performance optimized (<1s for patch generation)
 *
 * Usage:
 *   const generator = new PatchGenerator({ dbPath: './patches.db' });
 *   const patch = generator.generatePatch(failure, category);
 *   if (patch.confidence >= 0.85) {
 *     const proposal = await generator.createPatchProposal(patch);
 *   }
 */

import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { createLogger } from '../lib/logging';
import { StandardError, ErrorCode, createError } from '../lib/errors';
import { FailureCategory, Failure } from './edge-case-analyzer';

const logger = createLogger('patch-generator');

/**
 * Patch type classification
 */
export enum PatchType {
  ADD_ERROR_HANDLING = 'ADD_ERROR_HANDLING',
  ADD_NULL_CHECK = 'ADD_NULL_CHECK',
  ADD_TYPE_VALIDATION = 'ADD_TYPE_VALIDATION',
  ADD_TIMEOUT = 'ADD_TIMEOUT',
  ADD_FILE_CHECK = 'ADD_FILE_CHECK',
}

/**
 * Patch status
 */
export enum PatchStatus {
  PENDING_UPDATE = 'PENDING_UPDATE',
  APPROVED = 'APPROVED',
  DEPLOYED = 'DEPLOYED',
  REJECTED = 'REJECTED',
  ROLLED_BACK = 'ROLLED_BACK',
}

/**
 * Patch definition
 */
export interface Patch {
  id: string;
  failureId: string;
  skillId: string;
  type: PatchType;
  category: FailureCategory;
  content: string;
  targetFile: string;
  targetLine: number;
  confidence: number;
  similarFailureCount: number;
}

/**
 * Patch proposal with metadata
 */
export interface PatchProposal {
  patch: Patch;
  status: PatchStatus;
  createdAt: Date;
  preview: string;
  approvedBy?: string;
  deployedAt?: Date;
  success?: boolean;
  rollbackReason?: string;
}

/**
 * Generator configuration
 */
export interface PatchGeneratorConfig {
  dbPath: string;
  confidenceThreshold?: number;
}

/**
 * Patch Generator Service
 */
export class PatchGenerator {
  private db: Database.Database;
  private confidenceThreshold: number;

  constructor(config: PatchGeneratorConfig) {
    this.db = new Database(config.dbPath);
    this.confidenceThreshold = config.confidenceThreshold || 0.85;
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_patches (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        failure_id TEXT NOT NULL,
        category TEXT NOT NULL,
        patch_content TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT DEFAULT 'PENDING_UPDATE',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved_by TEXT,
        deployed_at TEXT,
        success INTEGER,
        rollback_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_skill_patches_skill ON skill_patches(skill_id);
      CREATE INDEX IF NOT EXISTS idx_skill_patches_status ON skill_patches(status);
      CREATE INDEX IF NOT EXISTS idx_skill_patches_confidence ON skill_patches(confidence);
    `);
  }

  /**
   * Parse target file and line from stack trace
   */
  private parseStackTrace(stackTrace: string): { file: string; line: number } {
    // Try to extract file and line from stack trace
    // Formats:
    // - at functionName (file.ts:42:10)
    // - at /absolute/path/file.ts:42:10
    // - at functionName (/absolute/path/file.ts:42:10)

    const patterns = [
      /at\s+.*?\(([^:]+):(\d+):\d+\)/, // at func (file:line:col)
      /at\s+([^:]+):(\d+):\d+/, // at file:line:col
      /\(([^:]+):(\d+):\d+\)/, // (file:line:col)
    ];

    for (const pattern of patterns) {
      const match = stackTrace.match(pattern);
      if (match) {
        const file = match[1].trim();
        const line = parseInt(match[2], 10);
        return { file, line };
      }
    }

    return { file: 'unknown', line: 0 };
  }

  /**
   * Generate patch for failure
   *
   * Performance target: <1s
   */
  generatePatch(failure: Failure, category: FailureCategory): Patch {
    const startTime = Date.now();

    const { file, line } = this.parseStackTrace(failure.stackTrace);

    let patchType: PatchType;
    let content: string;

    // Determine patch type and generate content based on failure category
    if (category === FailureCategory.TIMEOUT) {
      patchType = PatchType.ADD_TIMEOUT;
      const timeout = failure.context.timeout || 5000;
      content = `const result = await withTimeout(operation(), ${timeout});`;
    } else if (
      category === FailureCategory.VALIDATION_ERROR &&
      (failure.errorMessage.includes('null') || failure.errorMessage.includes('undefined'))
    ) {
      patchType = PatchType.ADD_NULL_CHECK;
      const variableName = this.extractVariableName(failure.errorMessage);
      content = `if (${variableName} === null || ${variableName} === undefined) {
  throw new StandardError('NULL_VALUE', '${variableName} cannot be null or undefined');
}`;
    } else if (
      category === FailureCategory.VALIDATION_ERROR &&
      (failure.errorMessage.includes('Expected') || failure.errorMessage.includes('type'))
    ) {
      patchType = PatchType.ADD_TYPE_VALIDATION;
      const expectedType = failure.context.expectedType || 'string';
      const variableName = this.extractVariableName(failure.errorMessage);
      content = `if (typeof ${variableName} !== '${expectedType}') {
  throw new StandardError('INVALID_TYPE', 'Expected ${expectedType} but got ' + typeof ${variableName});
}`;
    } else if (
      category === FailureCategory.LOGIC_ERROR &&
      failure.errorMessage.includes('File not found')
    ) {
      patchType = PatchType.ADD_FILE_CHECK;
      const filePath = failure.context.filePath || 'filePath';
      content = `if (!fs.existsSync(${filePath})) {
  throw new StandardError('FILE_NOT_FOUND', \`File not found: \${${filePath}}\`);
}`;
    } else {
      // Default to error handling
      patchType = PatchType.ADD_ERROR_HANDLING;
      const operation = failure.context.operation || 'operation';
      content = `try {
  // existing code for ${operation}
} catch (error) {
  logger.error('${operation} failed', error);
  throw new StandardError('OPERATION_FAILED', '${operation} failed', {}, error);
}`;
    }

    const patch: Patch = {
      id: crypto.randomUUID(),
      failureId: failure.id,
      skillId: failure.skillId,
      type: patchType,
      category,
      content,
      targetFile: file,
      targetLine: line,
      confidence: 0, // Will be calculated separately
      similarFailureCount: 0, // Will be set by caller
    };

    logger.debug('Patch generated', {
      patchType,
      targetFile: file,
      targetLine: line,
      durationMs: Date.now() - startTime,
    });

    return patch;
  }

  /**
   * Extract variable name from error message
   */
  private extractVariableName(errorMessage: string): string {
    // Try to extract variable name from error messages like:
    // - "Cannot read property 'x' of null"
    // - "userData is null"
    // - "Expected string but got number for field"

    const patterns = [
      /Cannot read property.*?of (\w+)/,
      /(\w+) is (null|undefined)/,
      /for (\w+)/,
      /(\w+) cannot be/,
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match && match[1] !== 'null' && match[1] !== 'undefined') {
        return match[1];
      }
    }

    return 'value';
  }

  /**
   * Calculate patch confidence
   *
   * Factors:
   * - Number of similar failures (higher = more confident)
   * - Patch type (some types are more reliable)
   * - Category (some categories are easier to fix)
   *
   * Threshold: ≥0.85 for auto-approval consideration
   */
  calculatePatchConfidence(patch: Patch): number {
    let confidence = 0.5; // Base confidence

    // Similar failure count boost (up to +0.4)
    const failureBoost = Math.min(0.4, patch.similarFailureCount * 0.04);
    confidence += failureBoost;

    // Patch type boost
    if (
      patch.type === PatchType.ADD_ERROR_HANDLING ||
      patch.type === PatchType.ADD_NULL_CHECK
    ) {
      confidence += 0.1; // These are generally safe
    }

    if (patch.type === PatchType.ADD_FILE_CHECK || patch.type === PatchType.ADD_TIMEOUT) {
      confidence += 0.05; // Moderately safe
    }

    // Category boost
    if (patch.category === FailureCategory.VALIDATION_ERROR) {
      confidence += 0.05; // Validation fixes are usually straightforward
    }

    return Math.min(0.98, confidence);
  }

  /**
   * Create patch proposal (requires confidence ≥ threshold)
   */
  async createPatchProposal(patch: Patch): Promise<PatchProposal> {
    const startTime = Date.now();

    // Calculate confidence if not set
    if (patch.confidence === 0) {
      patch.confidence = this.calculatePatchConfidence(patch);
    }

    // Enforce confidence threshold
    if (patch.confidence < this.confidenceThreshold) {
      throw createError(
        ErrorCode.VALIDATION_FAILED,
        `Patch confidence ${patch.confidence.toFixed(2)} below threshold ${this.confidenceThreshold}`,
        { patchId: patch.id, confidence: patch.confidence }
      );
    }

    // Generate preview
    const preview = this.generatePatchPreview(patch);

    // Store in database
    this.db
      .prepare(
        `
      INSERT INTO skill_patches (id, skill_id, failure_id, category, patch_content, confidence, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        patch.id,
        patch.skillId,
        patch.failureId,
        patch.category,
        patch.content,
        patch.confidence,
        PatchStatus.PENDING_UPDATE
      );

    const proposal: PatchProposal = {
      patch,
      status: PatchStatus.PENDING_UPDATE,
      createdAt: new Date(),
      preview,
    };

    logger.info('Patch proposal created', {
      patchId: patch.id,
      confidence: patch.confidence,
      status: PatchStatus.PENDING_UPDATE,
      durationMs: Date.now() - startTime,
    });

    return proposal;
  }

  /**
   * Generate human-readable patch preview
   */
  private generatePatchPreview(patch: Patch): string {
    return `
Patch Preview
=============
ID: ${patch.id}
Type: ${patch.type}
Category: ${patch.category}
Skill: ${patch.skillId}
Confidence: ${patch.confidence.toFixed(2)}

Target:
  File: ${patch.targetFile}
  Line: ${patch.targetLine}

Patch Content:
${patch.content.split('\n').map(line => '  ' + line).join('\n')}

Similar Failures: ${patch.similarFailureCount}
Status: Pending Manual Approval
    `.trim();
  }

  /**
   * Get patch proposal by ID
   */
  getPatchProposal(patchId: string): PatchProposal | undefined {
    const stmt = this.db.prepare('SELECT * FROM skill_patches WHERE id = ?');
    const row = stmt.get(patchId) as any;

    if (!row) {
      return undefined;
    }

    const patch: Patch = {
      id: row.id,
      failureId: row.failure_id,
      skillId: row.skill_id,
      type: row.category as PatchType, // Note: Using category for type mapping
      category: row.category as FailureCategory,
      content: row.patch_content,
      targetFile: '', // Not stored in DB for simplicity
      targetLine: 0,
      confidence: row.confidence,
      similarFailureCount: 0, // Not stored in DB
    };

    const proposal: PatchProposal = {
      patch,
      status: row.status as PatchStatus,
      createdAt: new Date(row.created_at),
      preview: this.generatePatchPreview(patch),
      approvedBy: row.approved_by,
      deployedAt: row.deployed_at ? new Date(row.deployed_at) : undefined,
      success: row.success !== null ? Boolean(row.success) : undefined,
      rollbackReason: row.rollback_reason,
    };

    return proposal;
  }

  /**
   * Get pending patches (optionally filtered by skill)
   */
  getPendingPatches(skillId?: string): PatchProposal[] {
    let query = `
      SELECT * FROM skill_patches
      WHERE status = 'PENDING_UPDATE'
    `;
    const params: any[] = [];

    if (skillId) {
      query += ' AND skill_id = ?';
      params.push(skillId);
    }

    query += ' ORDER BY confidence DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => {
      const patch: Patch = {
        id: row.id,
        failureId: row.failure_id,
        skillId: row.skill_id,
        type: this.inferPatchType(row.patch_content),
        category: row.category as FailureCategory,
        content: row.patch_content,
        targetFile: '',
        targetLine: 0,
        confidence: row.confidence,
        similarFailureCount: 0,
      };

      return {
        patch,
        status: row.status as PatchStatus,
        createdAt: new Date(row.created_at),
        preview: this.generatePatchPreview(patch),
        approvedBy: row.approved_by,
        deployedAt: row.deployed_at ? new Date(row.deployed_at) : undefined,
        success: row.success !== null ? Boolean(row.success) : undefined,
        rollbackReason: row.rollback_reason,
      };
    });
  }

  /**
   * Infer patch type from content
   */
  private inferPatchType(content: string): PatchType {
    if (content.includes('withTimeout')) {
      return PatchType.ADD_TIMEOUT;
    }
    if (content.includes('null') || content.includes('undefined')) {
      return PatchType.ADD_NULL_CHECK;
    }
    if (content.includes('typeof')) {
      return PatchType.ADD_TYPE_VALIDATION;
    }
    if (content.includes('fs.existsSync')) {
      return PatchType.ADD_FILE_CHECK;
    }
    return PatchType.ADD_ERROR_HANDLING;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
