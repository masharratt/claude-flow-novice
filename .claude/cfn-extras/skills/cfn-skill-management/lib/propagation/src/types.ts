/**
 * Type definitions for the Skill Propagation System
 * Migrated from propagate-skill-update.sh
 */

export interface SkillMetadata {
  name?: string;
  version?: string;
  description?: string;
  tags?: string[];
  category?: string;
  owner?: string;
  approval_level?: string;
  [key: string]: unknown;
}

export interface SkillInfo {
  id: number;
  name: string;
  version: string;
  content_hash: string;
  content_path: string;
  tags?: string;
  category?: string;
  owner?: string;
  approval_level?: string;
  updated_at?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
}

export type VersionChangeType = 'major' | 'minor' | 'patch' | 'same' | 'downgrade';

export interface VersionComparisonResult {
  changeType: VersionChangeType;
  isValid: boolean;
}

export interface ContentHashResult {
  hash: string;
  hashChanged: boolean;
}

export interface PropagationResult {
  success: boolean;
  skillName: string;
  newVersion: string;
  oldVersion: string;
  changeType: VersionChangeType;
  contentHash: string;
  metadata: {
    tags?: string;
    category?: string;
    owner?: string;
    approval_level?: string;
  };
  affectedAgents?: string[];
  timestamp: string;
}

export interface ApprovalHistoryRecord {
  skill_id: number;
  version: string;
  approval_level: string;
  approver: string;
  decision: string;
  reasoning: string;
  approval_criteria_check: string;
  timestamp: string;
}

export interface SkillPropagationOptions {
  skillName: string;
  newVersion: string;
  updatePath: string;
  changeType?: 'patch' | 'minor' | 'major';
  notifyAgents?: boolean;
  databasePath?: string;
  phase4PostgresHost?: string;
  phase4PostgresDb?: string;
  phase4PostgresUser?: string;
  phase4PostgresPass?: string;
  enableAgentNotifications?: boolean;
  debug?: boolean;
}

export interface LoggerConfig {
  debug?: boolean;
  verbose?: boolean;
}

export interface FileSystemAdapter {
  readFile(path: string): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  isReadable(path: string): Promise<boolean>;
  calculateHash(path: string): Promise<string>;
}

export interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<any>;
  selectOne(sql: string, params?: any[]): Promise<any>;
  selectAll(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  getAffectedAgents(skillId: number): Promise<string[]>;
  close(): Promise<void>;
}

export interface MetadataParser {
  parse(content: string): SkillMetadata;
  validate(metadata: SkillMetadata): ValidationResult;
}

export interface SkillValidator {
  validateParameters(options: SkillPropagationOptions): Promise<ValidationResult>;
  validateSkillExists(skillName: string): Promise<boolean>;
  validateVersionIncrement(
    currentVersion: string,
    newVersion: string,
    expectedChangeType: 'patch' | 'minor' | 'major'
  ): Promise<ValidationResult>;
}

export interface SkillPropagator {
  propagate(options: SkillPropagationOptions): Promise<PropagationResult>;
}

export interface Logger {
  info(message: string): void;
  success(message: string): void;
  error(message: string): void;
  warning(message: string): void;
  debug(message: string): void;
}
