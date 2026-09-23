/**
 * Skill Propagation System - Public API
 * TypeScript migration from propagate-skill-update.sh
 */

import { SkillPropagator } from './skill-propagator';
import { SkillValidator } from './skill-validator';
import { SkillMetadataParser } from './metadata-parser';
import { VersionManager } from './version-manager';
import { ConsoleLogger, NoOpLogger } from './logger';
import { NodeFileSystemAdapter, MockFileSystemAdapter } from './file-system-adapter';
import { SQLiteDatabaseAdapter, MockDatabaseAdapter } from './database-adapter';

export { SkillPropagator, SkillValidator, SkillMetadataParser, VersionManager };
export { ConsoleLogger, NoOpLogger };
export { NodeFileSystemAdapter, MockFileSystemAdapter };
export { SQLiteDatabaseAdapter, MockDatabaseAdapter };

// Type exports
export type {
  SkillMetadata,
  SkillInfo,
  ValidationResult,
  VersionInfo,
  VersionChangeType,
  VersionComparisonResult,
  ContentHashResult,
  PropagationResult,
  ApprovalHistoryRecord,
  SkillPropagationOptions,
  LoggerConfig,
  FileSystemAdapter,
  DatabaseAdapter,
  MetadataParser,
  SkillValidator as ISkillValidator,
  SkillPropagator as ISkillPropagator,
  Logger,
} from './types';

/**
 * Convenience function to create a fully configured propagator
 */
export async function createSkillPropagator(
  databasePath: string = './.claude/skills-database/skills.db'
) {
  const { NodeFileSystemAdapter: NodeFSAdapter } = await import('./file-system-adapter');
  const { SQLiteDatabaseAdapter: SQLiteDB } = await import('./database-adapter');
  const { ConsoleLogger: Logger } = await import('./logger');
  const { SkillPropagator: Propagator } = await import('./skill-propagator');

  const fs = new NodeFSAdapter();
  const db = new SQLiteDB(databasePath);
  const logger = new Logger({ debug: process.env['DEBUG'] === '1' });

  return new Propagator(fs, db, logger);
}

const defaultExport = {
  SkillPropagator,
  SkillValidator,
  SkillMetadataParser,
  VersionManager,
  ConsoleLogger,
  NoOpLogger,
  NodeFileSystemAdapter,
  MockFileSystemAdapter,
  SQLiteDatabaseAdapter,
  MockDatabaseAdapter,
  createSkillPropagator,
};

export default defaultExport;
