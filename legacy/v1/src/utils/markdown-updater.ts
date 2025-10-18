/**
 * Markdown Progress Updater
 *
 * Updates sprint/phase status in markdown files with emoji indicators:
 * - ❌ Not Started
 * - 🔄 In Progress
 * - ✅ Complete
 *
 * Features:
 * - Parse markdown to find sprint/phase sections
 * - Update status emoji while preserving formatting
 * - Atomic writes with backup and rollback
 * - Support for phase files and epic overview
 * - Integration with SprintOrchestrator and PhaseOrchestrator
 *
 * @module utils/markdown-updater
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../core/logger.js';

// ===== TYPE DEFINITIONS =====

/**
 * Status indicator emojis
 */
export enum StatusEmoji {
  NOT_STARTED = '❌',
  IN_PROGRESS = '🔄',
  COMPLETE = '✅',
  BLOCKED = '🔴',
  PENDING = '⏳',
  AT_RISK = '⚠️',
}

/**
 * Status update operation
 */
export interface StatusUpdate {
  /** Section identifier (phase/sprint ID) */
  sectionId: string;
  /** New status emoji */
  newStatus: StatusEmoji;
  /** Additional metadata (completion %, timestamp, etc.) */
  metadata?: {
    completionPercent?: number;
    timestamp?: number;
    blocker?: string;
  };
}

/**
 * Markdown section representation
 */
interface MarkdownSection {
  /** Section identifier */
  id: string;
  /** Line number where section starts */
  startLine: number;
  /** Line number where section ends */
  endLine: number;
  /** Current status emoji */
  currentStatus: StatusEmoji | null;
  /** Line number where status is located */
  statusLine: number;
  /** Full section content */
  content: string;
}

/**
 * Markdown updater configuration
 */
export interface MarkdownUpdaterConfig {
  /** Enable backup before modification */
  enableBackup?: boolean;
  /** Backup directory path */
  backupDir?: string;
  /** Validate markdown structure after update */
  validateAfterUpdate?: boolean;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Update result
 */
export interface UpdateResult {
  success: boolean;
  filePath: string;
  backupPath?: string;
  sectionsUpdated: number;
  errors: string[];
  warnings: string[];
}

// ===== MARKDOWN UPDATER =====

export class MarkdownUpdater {
  private config: Required<MarkdownUpdaterConfig>;
  private logger: Logger;

  constructor(config: MarkdownUpdaterConfig = {}) {
    // Set defaults
    this.config = {
      enableBackup: config.enableBackup ?? true,
      backupDir: config.backupDir || path.join(process.cwd(), '.claude-flow', 'backups'),
      validateAfterUpdate: config.validateAfterUpdate ?? true,
      logger: config.logger || new Logger(
        { level: 'info', format: 'json', destination: 'console' },
        { component: 'MarkdownUpdater' }
      ),
    };

    this.logger = this.config.logger;
  }

  /**
   * Update status in a markdown file
   *
   * @param filePath - Path to markdown file
   * @param updates - Array of status updates
   * @returns Update result with success/failure details
   */
  async updateStatus(filePath: string, updates: StatusUpdate[]): Promise<UpdateResult> {
    this.logger.info('Updating markdown status', {
      filePath,
      updateCount: updates.length,
    });

    const result: UpdateResult = {
      success: false,
      filePath,
      sectionsUpdated: 0,
      errors: [],
      warnings: [],
    };

    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        result.errors.push(`File does not exist: ${filePath}`);
        return result;
      }

      // Read original content
      const originalContent = await fs.promises.readFile(filePath, 'utf-8');

      // Create backup if enabled
      if (this.config.enableBackup) {
        result.backupPath = await this.createBackup(filePath, originalContent);
        this.logger.info('Backup created', { backupPath: result.backupPath });
      }

      // Parse markdown sections
      const sections = this.parseMarkdownSections(originalContent);

      this.logger.info('Parsed markdown sections', {
        totalSections: sections.length,
        sectionIds: sections.map(s => s.id),
      });

      // Apply updates
      let updatedContent = originalContent;
      const lines = updatedContent.split('\n');

      for (const update of updates) {
        const section = sections.find(s => s.id === update.sectionId);

        if (!section) {
          result.warnings.push(`Section not found: ${update.sectionId}`);
          continue;
        }

        // Update status emoji in the line
        const statusLine = lines[section.statusLine];
        const updatedLine = this.replaceStatusEmoji(
          statusLine,
          section.currentStatus,
          update.newStatus,
          update.metadata
        );

        lines[section.statusLine] = updatedLine;
        result.sectionsUpdated++;

        this.logger.info('Updated section status', {
          sectionId: update.sectionId,
          oldStatus: section.currentStatus,
          newStatus: update.newStatus,
          line: section.statusLine,
        });
      }

      updatedContent = lines.join('\n');

      // Validate markdown structure if enabled
      if (this.config.validateAfterUpdate) {
        const validationErrors = this.validateMarkdownStructure(updatedContent);
        if (validationErrors.length > 0) {
          result.errors.push(...validationErrors);

          // Rollback on validation failure
          if (result.backupPath) {
            await this.rollbackFromBackup(filePath, result.backupPath);
            result.warnings.push('Rolled back changes due to validation failure');
          }

          return result;
        }
      }

      // Write updated content atomically
      await this.writeAtomic(filePath, updatedContent);

      result.success = true;

      this.logger.info('Markdown status updated successfully', {
        filePath,
        sectionsUpdated: result.sectionsUpdated,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Update failed: ${errorMsg}`);

      this.logger.error('Markdown update failed', {
        filePath,
        error: errorMsg,
      });

      // Rollback on error
      if (result.backupPath) {
        try {
          await this.rollbackFromBackup(filePath, result.backupPath);
          result.warnings.push('Rolled back changes due to error');
        } catch (rollbackError) {
          result.errors.push(
            `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
          );
        }
      }

      return result;
    }
  }

  /**
   * Update sprint status (convenience method)
   *
   * @param filePath - Path to sprint markdown file
   * @param sprintId - Sprint identifier (e.g., "Sprint 1.1")
   * @param status - New status
   * @param metadata - Optional metadata
   */
  async updateSprintStatus(
    filePath: string,
    sprintId: string,
    status: StatusEmoji,
    metadata?: StatusUpdate['metadata']
  ): Promise<UpdateResult> {
    return this.updateStatus(filePath, [
      {
        sectionId: sprintId,
        newStatus: status,
        metadata,
      },
    ]);
  }

  /**
   * Update phase status in overview file
   *
   * @param overviewPath - Path to PHASE_OVERVIEW.md
   * @param phaseId - Phase identifier (e.g., "Phase 0")
   * @param status - New status
   * @param completionPercent - Completion percentage (0-100)
   */
  async updatePhaseStatus(
    overviewPath: string,
    phaseId: string,
    status: StatusEmoji,
    completionPercent?: number
  ): Promise<UpdateResult> {
    return this.updateStatus(overviewPath, [
      {
        sectionId: phaseId,
        newStatus: status,
        metadata: {
          completionPercent,
          timestamp: Date.now(),
        },
      },
    ]);
  }

  /**
   * Calculate phase completion based on sprint statuses
   *
   * @param phaseFilePath - Path to phase markdown file
   * @returns Completion percentage and overall status
   */
  async calculatePhaseCompletion(phaseFilePath: string): Promise<{
    completionPercent: number;
    status: StatusEmoji;
    sprintStatuses: { id: string; status: StatusEmoji | null }[];
  }> {
    if (!fs.existsSync(phaseFilePath)) {
      throw new Error(`Phase file does not exist: ${phaseFilePath}`);
    }

    const content = await fs.promises.readFile(phaseFilePath, 'utf-8');
    const sections = this.parseMarkdownSections(content);

    // Filter only sprint sections
    const sprints = sections.filter((s) => s.id.startsWith('Sprint '));

    if (sprints.length === 0) {
      return {
        completionPercent: 0,
        status: StatusEmoji.NOT_STARTED,
        sprintStatuses: [],
      };
    }

    // Count sprint statuses
    const completedSprints = sprints.filter((s) => s.currentStatus === StatusEmoji.COMPLETE).length;
    const inProgressSprints = sprints.filter((s) => s.currentStatus === StatusEmoji.IN_PROGRESS).length;

    const completionPercent = Math.round((completedSprints / sprints.length) * 100);

    // Determine overall phase status
    let status: StatusEmoji;
    if (completedSprints === sprints.length) {
      status = StatusEmoji.COMPLETE;
    } else if (completedSprints > 0 || inProgressSprints > 0) {
      status = StatusEmoji.IN_PROGRESS;
    } else {
      status = StatusEmoji.NOT_STARTED;
    }

    const sprintStatuses = sprints.map((s) => ({
      id: s.id,
      status: s.currentStatus,
    }));

    this.logger.info('Calculated phase completion', {
      phaseFilePath,
      completionPercent,
      status,
      totalSprints: sprints.length,
      completedSprints,
      inProgressSprints,
    });

    return {
      completionPercent,
      status,
      sprintStatuses,
    };
  }

  /**
   * Update phase-level status in phase file (top-level **Status**: line)
   *
   * @param phaseFilePath - Path to phase markdown file
   * @param status - New status
   */
  async updatePhaseFileStatus(phaseFilePath: string, status: StatusEmoji): Promise<UpdateResult> {
    if (!fs.existsSync(phaseFilePath)) {
      return {
        success: false,
        filePath: phaseFilePath,
        sectionsUpdated: 0,
        errors: [`File does not exist: ${phaseFilePath}`],
        warnings: [],
      };
    }

    const content = await fs.promises.readFile(phaseFilePath, 'utf-8');
    const lines = content.split('\n');

    // Find phase-level **Status**: line (usually in first 20 lines)
    let phaseStatusLine = -1;
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      if (lines[i].match(/^\*\*Status\*\*:\s*(❌|🔄|✅|🔴|⏳|⚠️)/)) {
        phaseStatusLine = i;
        break;
      }
    }

    if (phaseStatusLine === -1) {
      return {
        success: false,
        filePath: phaseFilePath,
        sectionsUpdated: 0,
        errors: ['Phase-level **Status**: line not found in file'],
        warnings: [],
      };
    }

    // Update the status line
    const oldLine = lines[phaseStatusLine];
    const newLine = oldLine.replace(
      /^\*\*Status\*\*:\s*(❌|🔄|✅|🔴|⏳|⚠️)(.*)$/,
      `**Status**: ${status}$2`
    );

    lines[phaseStatusLine] = newLine;

    const updatedContent = lines.join('\n');

    // Write atomically
    await this.writeAtomic(phaseFilePath, updatedContent);

    this.logger.info('Updated phase file status', {
      phaseFilePath,
      oldStatus: oldLine,
      newStatus: newLine,
    });

    return {
      success: true,
      filePath: phaseFilePath,
      sectionsUpdated: 1,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Parse markdown file into sections
   */
  private parseMarkdownSections(content: string): MarkdownSection[] {
    const lines = content.split('\n');
    const sections: MarkdownSection[] = [];

    // Pattern 1: Table rows (for phase overview)
    // | **Phase 0** | ⏳ Pending | 0% | None - ready to start |
    const tableRowPattern = /^\|\s*\*?\*?(.+?)\*?\*?\s*\|\s*(❌|🔄|✅|🔴|⏳|⚠️)\s*(.+?)\s*\|/;

    // Pattern 2: List items (for sprint files)
    // - [x] ✅ **Sprint 1.1**: SDK Foundation (Complete)
    const listItemPattern = /^[\s\-\*]+\[.\]\s*(❌|🔄|✅|🔴|⏳|⚠️)\s*\*?\*?(.+?)\*?\*?:/;

    // Pattern 3: Checklist items (for success criteria)
    // - [x] **Agent Spawning Performance**: Spawn 20 agents in <2s
    const checklistPattern = /^[\s\-\*]+\[(x| )\]\s*\*?\*?(.+?)\*?\*?:/;

    // Pattern 4: Heading-based sprint sections (NEW)
    // ### Sprint 1.1: User Registration & Password Security
    // **Status**: ❌ Not Started
    const sprintHeadingPattern = /^###\s+(Sprint\s+\d+\.\d+):\s+(.+)/;
    const statusLinePattern = /^\*\*Status\*\*:\s*(❌|🔄|✅|🔴|⏳|⚠️)\s*(.*)$/;

    // Pattern 5: Phase-level status in phase files (NEW)
    // **Status**: ❌ Not Started
    const phaseStatusPattern = /^\*\*Status\*\*:\s*(❌|🔄|✅|🔴|⏳|⚠️)\s*(.*)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check heading-based sprint section (Pattern 4)
      const sprintMatch = line.match(sprintHeadingPattern);
      if (sprintMatch) {
        const sprintId = sprintMatch[1]; // "Sprint 1.1"
        const sprintName = sprintMatch[2]; // "User Registration & Password Security"

        // Look ahead for **Status**: line
        let statusLine = -1;
        let currentStatus: StatusEmoji | null = null;

        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          // Trim to handle Windows line endings (\r\n)
          const trimmedLine = lines[j].trim();
          const statusMatch = trimmedLine.match(statusLinePattern);
          if (statusMatch) {
            statusLine = j;
            currentStatus = this.parseStatusEmoji(statusMatch[1]);
            break;
          }

          // Stop at next heading
          if (trimmedLine.match(/^#{1,6}\s/)) {
            break;
          }
        }

        if (statusLine !== -1) {
          sections.push({
            id: sprintId,
            startLine: i,
            endLine: statusLine,
            currentStatus,
            statusLine,
            content: `${line}\n${lines[statusLine]}`,
          });
        }

        continue;
      }

      // Check table row pattern
      let match = line.match(tableRowPattern);
      if (match) {
        const sectionId = match[1].trim();
        const status = this.parseStatusEmoji(match[2].trim());

        sections.push({
          id: sectionId,
          startLine: i,
          endLine: i,
          currentStatus: status,
          statusLine: i,
          content: line,
        });

        continue;
      }

      // Check list item pattern
      match = line.match(listItemPattern);
      if (match) {
        const status = this.parseStatusEmoji(match[1].trim());
        const sectionId = match[2].trim();

        sections.push({
          id: sectionId,
          startLine: i,
          endLine: i,
          currentStatus: status,
          statusLine: i,
          content: line,
        });

        continue;
      }

      // Check checklist pattern
      match = line.match(checklistPattern);
      if (match) {
        const checkState = match[1];
        const sectionId = match[2].trim();
        const status = checkState === 'x' ? StatusEmoji.COMPLETE : StatusEmoji.NOT_STARTED;

        sections.push({
          id: sectionId,
          startLine: i,
          endLine: i,
          currentStatus: status,
          statusLine: i,
          content: line,
        });
      }
    }

    return sections;
  }

  /**
   * Parse status emoji from string
   */
  private parseStatusEmoji(emoji: string): StatusEmoji | null {
    const emojiMap: Record<string, StatusEmoji> = {
      '❌': StatusEmoji.NOT_STARTED,
      '🔄': StatusEmoji.IN_PROGRESS,
      '✅': StatusEmoji.COMPLETE,
      '🔴': StatusEmoji.BLOCKED,
      '⏳': StatusEmoji.PENDING,
      '⚠️': StatusEmoji.AT_RISK,
    };

    return emojiMap[emoji] || null;
  }

  /**
   * Replace status emoji in a line
   */
  private replaceStatusEmoji(
    line: string,
    oldStatus: StatusEmoji | null,
    newStatus: StatusEmoji,
    metadata?: StatusUpdate['metadata']
  ): string {
    let updatedLine = line;

    // Replace emoji if old status exists
    if (oldStatus) {
      updatedLine = updatedLine.replace(oldStatus, newStatus);
    } else {
      // Insert emoji if no status exists
      // Find insertion point (after checkbox or bullet)
      updatedLine = updatedLine.replace(/^([\s\-\*]+\[.\])/, `$1 ${newStatus}`);
    }

    // Update completion percentage if in table row
    if (metadata?.completionPercent !== undefined && updatedLine.includes('|')) {
      // Replace percentage: | 0% | → | 50% |
      updatedLine = updatedLine.replace(/\|\s*\d+%\s*\|/, `| ${metadata.completionPercent}% |`);
    }

    // Update checklist completion: [ ] → [x] for complete status
    if (newStatus === StatusEmoji.COMPLETE) {
      updatedLine = updatedLine.replace(/\[\s\]/, '[x]');
    } else if (newStatus === StatusEmoji.NOT_STARTED || newStatus === StatusEmoji.IN_PROGRESS) {
      updatedLine = updatedLine.replace(/\[x\]/, '[ ]');
    }

    return updatedLine;
  }

  /**
   * Validate markdown structure
   */
  private validateMarkdownStructure(content: string): string[] {
    const errors: string[] = [];

    // Check for balanced markdown syntax
    const headingPattern = /^#{1,6}\s+/gm;
    const tablePattern = /^\|(.+)\|$/gm;
    const listPattern = /^[\s\-\*]+/gm;

    const headings = content.match(headingPattern);
    const tables = content.match(tablePattern);
    const lists = content.match(listPattern);

    // Basic validation: ensure some structure exists
    if (!headings && !tables && !lists) {
      errors.push('No recognizable markdown structure found');
    }

    // Check for unmatched brackets
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/]/g) || []).length;

    if (openBrackets !== closeBrackets) {
      errors.push(`Unmatched brackets: ${openBrackets} open, ${closeBrackets} close`);
    }

    // Check for unmatched parentheses in links
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;

    if (openParens !== closeParens) {
      errors.push(`Unmatched parentheses: ${openParens} open, ${closeParens} close`);
    }

    return errors;
  }

  /**
   * Create backup of file
   */
  private async createBackup(filePath: string, content: string): Promise<string> {
    // Ensure backup directory exists
    if (!fs.existsSync(this.config.backupDir)) {
      await fs.promises.mkdir(this.config.backupDir, { recursive: true });
    }

    // Generate backup filename with timestamp
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${fileName}.${timestamp}.backup`;
    const backupPath = path.join(this.config.backupDir, backupFileName);

    // Write backup
    await fs.promises.writeFile(backupPath, content, 'utf-8');

    return backupPath;
  }

  /**
   * Rollback file from backup
   */
  private async rollbackFromBackup(filePath: string, backupPath: string): Promise<void> {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    const backupContent = await fs.promises.readFile(backupPath, 'utf-8');
    await fs.promises.writeFile(filePath, backupContent, 'utf-8');

    this.logger.info('Rolled back from backup', {
      filePath,
      backupPath,
    });
  }

  /**
   * Write file atomically (write to temp, then rename)
   */
  private async writeAtomic(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp.${Date.now()}`;

    try {
      // Write to temp file
      await fs.promises.writeFile(tempPath, content, 'utf-8');

      // Atomic rename
      await fs.promises.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
      throw error;
    }
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create MarkdownUpdater instance
 *
 * @param config - Updater configuration
 * @returns Configured MarkdownUpdater instance
 */
export function createMarkdownUpdater(config?: MarkdownUpdaterConfig): MarkdownUpdater {
  return new MarkdownUpdater(config);
}

// ===== INTEGRATION HELPERS =====

/**
 * SprintOrchestrator integration helper
 *
 * @param updater - MarkdownUpdater instance
 * @param sprintFilePath - Path to sprint markdown file
 * @param sprintId - Sprint identifier
 * @param status - New status
 */
export async function updateSprintStatusHook(
  updater: MarkdownUpdater,
  sprintFilePath: string,
  sprintId: string,
  status: StatusEmoji
): Promise<void> {
  const result = await updater.updateSprintStatus(sprintFilePath, sprintId, status);

  if (!result.success) {
    throw new Error(`Failed to update sprint status: ${result.errors.join(', ')}`);
  }
}

/**
 * PhaseOrchestrator integration helper
 *
 * @param updater - MarkdownUpdater instance
 * @param overviewPath - Path to PHASE_OVERVIEW.md
 * @param phaseId - Phase identifier
 * @param status - New status
 * @param completionPercent - Completion percentage
 */
export async function updatePhaseStatusHook(
  updater: MarkdownUpdater,
  overviewPath: string,
  phaseId: string,
  status: StatusEmoji,
  completionPercent?: number
): Promise<void> {
  const result = await updater.updatePhaseStatus(overviewPath, phaseId, status, completionPercent);

  if (!result.success) {
    throw new Error(`Failed to update phase status: ${result.errors.join(', ')}`);
  }
}

// ===== EXPORTS =====

export default MarkdownUpdater;
