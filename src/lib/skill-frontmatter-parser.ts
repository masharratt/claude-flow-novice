/**
 * Skill Frontmatter Parser
 *
 * Parses and validates YAML frontmatter in SKILL.md files
 * Supports semantic versioning and comprehensive metadata tracking
 *
 * @module skill-frontmatter-parser
 * @version 1.0.0
 */

import * as yaml from 'js-yaml';
import { StandardError } from './errors.js';

/**
 * Skill status lifecycle stages
 */
export type SkillStatus = 'draft' | 'approved' | 'staging' | 'deployed' | 'deprecated';

/**
 * Skill frontmatter schema
 */
export interface SkillFrontmatter {
  name: string;
  version: string;
  tags: string[];
  status: SkillStatus;
  author: string;
  description: string;
  dependencies?: string[];
  created?: string;
  updated?: string;

  // Optional extended metadata
  complexity?: 'Low' | 'Medium' | 'High';
  keywords?: string[];
  triggers?: string[];
  performance_targets?: Record<string, number | string>;
}

/**
 * Parsed frontmatter with content
 */
export interface ParsedSkillDocument {
  frontmatter: SkillFrontmatter;
  content: string;
  raw: string;
}

/**
 * Frontmatter validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Frontmatter parser error
 */
export class FrontmatterParseError extends StandardError {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super('FRONTMATTER_PARSE_ERROR', message, context);
    this.name = 'FrontmatterParseError';
  }
}

/**
 * Frontmatter validation error
 */
export class FrontmatterValidationError extends StandardError {
  constructor(message: string, public readonly errors: string[]) {
    super('FRONTMATTER_VALIDATION_ERROR', message, { errors });
    this.name = 'FrontmatterValidationError';
  }
}

/**
 * Semantic version regex pattern
 */
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Valid skill status values
 */
const VALID_STATUSES: SkillStatus[] = ['draft', 'approved', 'staging', 'deployed', 'deprecated'];

/**
 * Parse SKILL.md content and extract frontmatter
 *
 * @param content - Raw SKILL.md file content
 * @returns Parsed document with frontmatter and content
 * @throws FrontmatterParseError if parsing fails
 */
export function parseFrontmatter(content: string): ParsedSkillDocument {
  // Extract frontmatter block
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new FrontmatterParseError('No frontmatter block found. SKILL.md must start with YAML frontmatter enclosed in ---');
  }

  const [, frontmatterYaml, markdownContent] = frontmatterMatch;

  // Parse YAML
  let frontmatter: unknown;
  try {
    frontmatter = yaml.load(frontmatterYaml);
  } catch (error) {
    throw new FrontmatterParseError(
      'Failed to parse YAML frontmatter',
      {
        error: error instanceof Error ? error.message : String(error),
        yaml: frontmatterYaml.substring(0, 200)
      }
    );
  }

  // Validate structure
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new FrontmatterParseError('Frontmatter must be a valid YAML object');
  }

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    content: markdownContent.trim(),
    raw: content
  };
}

/**
 * Validate frontmatter against schema
 *
 * @param frontmatter - Frontmatter object to validate
 * @returns Validation result with errors and warnings
 */
export function validateFrontmatter(frontmatter: SkillFrontmatter): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    errors.push('Field "name" is required and must be a string');
  }

  if (!frontmatter.version || typeof frontmatter.version !== 'string') {
    errors.push('Field "version" is required and must be a string');
  } else if (!SEMVER_PATTERN.test(frontmatter.version)) {
    errors.push(`Field "version" must be valid semantic version (e.g., 1.0.0), got: ${frontmatter.version}`);
  }

  if (!Array.isArray(frontmatter.tags)) {
    errors.push('Field "tags" is required and must be an array');
  } else if (frontmatter.tags.length === 0) {
    warnings.push('Field "tags" is empty, consider adding tags for categorization');
  } else if (!frontmatter.tags.every(tag => typeof tag === 'string')) {
    errors.push('All tags must be strings');
  }

  if (!frontmatter.status) {
    errors.push('Field "status" is required');
  } else if (!VALID_STATUSES.includes(frontmatter.status)) {
    errors.push(`Field "status" must be one of: ${VALID_STATUSES.join(', ')}, got: ${frontmatter.status}`);
  }

  if (!frontmatter.author || typeof frontmatter.author !== 'string') {
    errors.push('Field "author" is required and must be a string');
  }

  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    errors.push('Field "description" is required and must be a string');
  } else if (frontmatter.description.length < 10) {
    warnings.push('Field "description" is very short, consider adding more detail');
  }

  // Optional fields validation
  if (frontmatter.dependencies !== undefined) {
    if (!Array.isArray(frontmatter.dependencies)) {
      errors.push('Field "dependencies" must be an array if provided');
    } else if (!frontmatter.dependencies.every(dep => typeof dep === 'string')) {
      errors.push('All dependencies must be strings');
    }
  }

  if (frontmatter.created !== undefined && typeof frontmatter.created !== 'string') {
    errors.push('Field "created" must be a string (ISO date) if provided');
  }

  if (frontmatter.updated !== undefined && typeof frontmatter.updated !== 'string') {
    errors.push('Field "updated" must be a string (ISO date) if provided');
  }

  // Date validation
  if (frontmatter.created) {
    const createdDate = new Date(frontmatter.created);
    if (isNaN(createdDate.getTime())) {
      errors.push(`Field "created" is not a valid date: ${frontmatter.created}`);
    }
  }

  if (frontmatter.updated) {
    const updatedDate = new Date(frontmatter.updated);
    if (isNaN(updatedDate.getTime())) {
      errors.push(`Field "updated" is not a valid date: ${frontmatter.updated}`);
    }

    // Check if updated is after created
    if (frontmatter.created) {
      const createdDate = new Date(frontmatter.created);
      const updatedDate = new Date(frontmatter.updated);
      if (updatedDate < createdDate) {
        errors.push('Field "updated" cannot be before "created"');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Parse and validate SKILL.md content
 *
 * @param content - Raw SKILL.md file content
 * @returns Parsed and validated document
 * @throws FrontmatterValidationError if validation fails
 */
export function parseAndValidate(content: string): ParsedSkillDocument {
  const parsed = parseFrontmatter(content);
  const validation = validateFrontmatter(parsed.frontmatter);

  if (!validation.valid) {
    throw new FrontmatterValidationError(
      'Frontmatter validation failed',
      validation.errors
    );
  }

  return parsed;
}

/**
 * Serialize frontmatter to YAML string
 *
 * @param frontmatter - Frontmatter object to serialize
 * @returns YAML string representation
 */
export function serializeFrontmatter(frontmatter: SkillFrontmatter): string {
  return yaml.dump(frontmatter, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false
  });
}

/**
 * Update frontmatter in SKILL.md content
 *
 * @param content - Original SKILL.md content
 * @param updates - Partial frontmatter updates
 * @returns Updated SKILL.md content
 */
export function updateFrontmatter(
  content: string,
  updates: Partial<SkillFrontmatter>
): string {
  const parsed = parseFrontmatter(content);
  const updated = { ...parsed.frontmatter, ...updates };

  // Update timestamp
  updated.updated = new Date().toISOString().split('T')[0];

  const yamlString = serializeFrontmatter(updated);
  return `---\n${yamlString}---\n${parsed.content}`;
}

/**
 * Create new SKILL.md content with frontmatter
 *
 * @param frontmatter - Frontmatter object
 * @param content - Markdown content
 * @returns Complete SKILL.md content
 */
export function createSkillDocument(
  frontmatter: SkillFrontmatter,
  content: string
): string {
  // Validate before creating
  const validation = validateFrontmatter(frontmatter);
  if (!validation.valid) {
    throw new FrontmatterValidationError(
      'Cannot create skill document with invalid frontmatter',
      validation.errors
    );
  }

  const yamlString = serializeFrontmatter(frontmatter);
  return `---\n${yamlString}---\n${content}`;
}

/**
 * Extract frontmatter summary for display
 *
 * @param frontmatter - Frontmatter object
 * @returns Human-readable summary
 */
export function getFrontmatterSummary(frontmatter: SkillFrontmatter): string {
  return `${frontmatter.name} v${frontmatter.version} [${frontmatter.status}]`;
}

/**
 * Compare two versions using semantic versioning
 *
 * @param version1 - First version string
 * @param version2 - Second version string
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (v1Parts[i] > v2Parts[i]) return 1;
    if (v1Parts[i] < v2Parts[i]) return -1;
  }

  return 0;
}
