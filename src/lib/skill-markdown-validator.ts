/**
 * Skill Markdown Validator
 *
 * Enforces consistent structure for all Markdown skill files with validated
 * frontmatter and content sections.
 *
 * @module skill-markdown-validator
 * @version 1.0.0
 */

import { parseFrontmatter, validateFrontmatter, ParsedSkillDocument } from './skill-frontmatter-parser';
import { StandardError } from './errors';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Skill markdown validation error
 */
export class SkillMarkdownError extends StandardError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('SKILL_MARKDOWN_VALIDATION_ERROR', message, context);
    this.name = 'SkillMarkdownError';
  }
}

/**
 * Required sections in skill files (in order)
 */
export const REQUIRED_SECTIONS = [
  'Overview',
  'Usage',
  'Examples',
  'Implementation',
  'Tests',
] as const;

/**
 * Optional sections (can appear after required sections)
 */
export const OPTIONAL_SECTIONS = [
  'API Reference',
  'Configuration',
  'Related Skills',
  'References',
  'Troubleshooting',
  'Performance',
  'Security',
  'Quick Start',
] as const;

/**
 * Supported code block languages
 */
export const SUPPORTED_LANGUAGES = [
  'bash',
  'sh',
  'typescript',
  'javascript',
  'json',
  'yaml',
  'yml',
  'markdown',
  'md',
  'python',
  'sql',
  'html',
  'css',
  'dockerfile',
  'plaintext',
  'text',
] as const;

/**
 * Minimum content length per section (characters)
 */
export const MIN_SECTION_LENGTH = 50;

/**
 * Content validation result
 */
export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sections: Record<string, boolean>;
  missingRequiredSections: string[];
  sectionOrderErrors: string[];
  optionalSections: string[];
}

/**
 * Code block metadata
 */
export interface CodeBlock {
  language: string;
  content: string;
  lineNumber: number;
}

/**
 * Code block validation result
 */
export interface CodeBlockValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  codeBlocks: CodeBlock[];
}

/**
 * Link metadata
 */
export interface Link {
  text: string;
  href: string;
  type: 'internal' | 'external' | 'anchor';
  lineNumber: number;
}

/**
 * Link validation result
 */
export interface LinkValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  links: Link[];
  brokenLinks: string[];
  externalLinks: string[];
}

/**
 * Complete skill markdown validation result
 */
export interface SkillMarkdownValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  frontmatterValid: boolean;
  contentValid: boolean;
  codeBlocksValid: boolean;
  linksValid: boolean;
}

/**
 * Validate complete skill markdown file
 *
 * @param content - Raw SKILL.md content
 * @param basePath - Base path for link validation (optional)
 * @returns Validation result
 * @throws SkillMarkdownError if parsing fails
 */
export function validateSkillMarkdown(
  content: string,
  basePath?: string
): SkillMarkdownValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let frontmatterValid = false;
  let contentValid = false;
  let codeBlocksValid = false;
  let linksValid = false;

  try {
    // Step 1: Parse and validate frontmatter
    const parsed = parseFrontmatter(content);
    const frontmatterValidation = validateFrontmatter(parsed.frontmatter);

    frontmatterValid = frontmatterValidation.valid;
    errors.push(...frontmatterValidation.errors);
    warnings.push(...frontmatterValidation.warnings);

    // Step 2: Validate content structure
    const contentValidation = validateContentStructure(parsed.content);
    contentValid = contentValidation.valid;
    errors.push(...contentValidation.errors);
    warnings.push(...contentValidation.warnings);

    // Step 3: Validate code blocks
    const codeBlockValidation = validateCodeBlocks(parsed.content);
    codeBlocksValid = codeBlockValidation.valid;
    errors.push(...codeBlockValidation.errors);
    warnings.push(...codeBlockValidation.warnings);

    // Step 4: Validate links (if basePath provided)
    if (basePath) {
      const linkValidation = validateInternalLinks(parsed.content, basePath);
      linksValid = linkValidation.valid;
      errors.push(...linkValidation.errors);
      warnings.push(...linkValidation.warnings);
    } else {
      linksValid = true; // Skip link validation if no basePath
    }

    return {
      valid: frontmatterValid && contentValid && codeBlocksValid && linksValid,
      errors,
      warnings,
      frontmatterValid,
      contentValid,
      codeBlocksValid,
      linksValid,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new SkillMarkdownError(
        'Failed to validate skill markdown',
        { originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Validate content structure and section ordering
 *
 * @param content - Markdown content (without frontmatter)
 * @returns Content validation result
 */
export function validateContentStructure(content: string): ContentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections: Record<string, boolean> = {};
  const missingRequiredSections: string[] = [];
  const sectionOrderErrors: string[] = [];
  const optionalSections: string[] = [];

  // Extract sections using regex
  const sectionRegex = /^##\s+(.+)$/gm;
  const foundSections: Array<{ name: string; index: number; content: string }> = [];
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1].trim();
    const sectionIndex = match.index;

    // Find content up to next section or end
    const nextMatch = sectionRegex.exec(content);
    const endIndex = nextMatch ? nextMatch.index : content.length;
    sectionRegex.lastIndex = nextMatch ? nextMatch.index : content.length;

    const sectionContent = content.substring(sectionIndex, endIndex);

    foundSections.push({
      name: sectionName,
      index: sectionIndex,
      content: sectionContent,
    });
  }

  // Check required sections
  REQUIRED_SECTIONS.forEach((requiredSection) => {
    const found = foundSections.some((s) => s.name === requiredSection);
    sections[requiredSection] = found;

    if (!found) {
      missingRequiredSections.push(requiredSection);
      errors.push(`Required section "${requiredSection}" is missing`);
    }
  });

  // Check section order
  let lastRequiredIndex = -1;
  REQUIRED_SECTIONS.forEach((requiredSection) => {
    const sectionIndex = foundSections.findIndex((s) => s.name === requiredSection);

    if (sectionIndex !== -1) {
      if (sectionIndex < lastRequiredIndex) {
        sectionOrderErrors.push(
          `Section "${requiredSection}" appears out of order (should be after previous required sections)`
        );
        errors.push(
          `Section "${requiredSection}" is out of order. Expected order: ${REQUIRED_SECTIONS.join(', ')}`
        );
      }
      lastRequiredIndex = sectionIndex;
    }
  });

  // Identify optional sections
  foundSections.forEach((section) => {
    if (
      !REQUIRED_SECTIONS.includes(section.name as any) &&
      OPTIONAL_SECTIONS.includes(section.name as any)
    ) {
      optionalSections.push(section.name);
    }
  });

  // Check minimum content length per section
  foundSections.forEach((section) => {
    const contentLength = section.content.replace(/^##.+$/m, '').trim().length;

    if (contentLength < MIN_SECTION_LENGTH) {
      warnings.push(
        `Section "${section.name}" has less than minimum content length (${contentLength} < ${MIN_SECTION_LENGTH} characters)`
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sections,
    missingRequiredSections,
    sectionOrderErrors,
    optionalSections,
  };
}

/**
 * Validate code blocks and syntax highlighting
 *
 * @param content - Markdown content
 * @returns Code block validation result
 */
export function validateCodeBlocks(content: string): CodeBlockValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const codeBlocks: CodeBlock[] = [];

  // Extract code blocks using regex
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let lineNumber = 1;

  // Track line numbers
  const lines = content.split('\n');

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || '';
    const blockContent = match[2];

    // Calculate line number
    const matchIndex = match.index;
    const precedingContent = content.substring(0, matchIndex);
    lineNumber = precedingContent.split('\n').length;

    // Check language specification
    if (!language) {
      errors.push(
        `Code block at line ${lineNumber} missing language specification`
      );
    } else {
      codeBlocks.push({
        language,
        content: blockContent,
        lineNumber,
      });

      // Check if language is supported
      if (!SUPPORTED_LANGUAGES.includes(language as any)) {
        warnings.push(
          `Code block at line ${lineNumber} uses unsupported language "${language}"`
        );
      }
    }

    // Check for empty code blocks
    if (blockContent.trim().length === 0) {
      warnings.push(`Code block at line ${lineNumber} is empty`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    codeBlocks,
  };
}

/**
 * Validate internal links and anchors
 *
 * @param content - Markdown content
 * @param basePath - Base path for resolving relative links
 * @returns Link validation result
 */
export function validateInternalLinks(
  content: string,
  basePath: string
): LinkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const links: Link[] = [];
  const brokenLinks: string[] = [];
  const externalLinks: string[] = [];

  // Extract all markdown links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const text = match[1];
    const href = match[2];

    // Calculate line number
    const precedingContent = content.substring(0, match.index);
    const lineNumber = precedingContent.split('\n').length;

    // Determine link type
    let linkType: 'internal' | 'external' | 'anchor';

    if (href.startsWith('http://') || href.startsWith('https://')) {
      linkType = 'external';
      externalLinks.push(href);
    } else if (href.startsWith('#')) {
      linkType = 'anchor';
    } else {
      linkType = 'internal';
    }

    links.push({
      text,
      href,
      type: linkType,
      lineNumber,
    });

    // Validate internal links
    if (linkType === 'internal') {
      const resolvedPath = path.resolve(basePath, href);

      if (!fs.existsSync(resolvedPath)) {
        brokenLinks.push(href);
        errors.push(
          `Broken internal link at line ${lineNumber}: "${href}" (resolved to ${resolvedPath})`
        );
      }
    }

    // Validate anchor links
    if (linkType === 'anchor') {
      const anchorName = href.substring(1); // Remove '#'
      const sectionRegex = new RegExp(`^##\\s+${anchorName}$`, 'im');

      // Also check slug format (lowercase, hyphens)
      const slugRegex = new RegExp(
        `^##\\s+${anchorName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}$`,
        'im'
      );

      if (!sectionRegex.test(content) && !slugRegex.test(content)) {
        brokenLinks.push(href);
        errors.push(
          `Broken anchor link at line ${lineNumber}: "${href}" (section not found)`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    links,
    brokenLinks,
    externalLinks,
  };
}

/**
 * Extract sections from markdown content
 *
 * @param content - Markdown content
 * @returns Map of section names to content
 */
export function extractSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const sectionRegex = /^##\s+(.+)$/gm;
  const matches: Array<{ name: string; index: number }> = [];

  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    matches.push({
      name: match[1].trim(),
      index: match.index,
    });
  }

  // Extract content for each section
  matches.forEach((current, index) => {
    const nextSection = matches[index + 1];
    const endIndex = nextSection ? nextSection.index : content.length;
    const sectionContent = content.substring(current.index, endIndex).trim();

    sections.set(current.name, sectionContent);
  });

  return sections;
}

/**
 * Get validation summary for display
 *
 * @param result - Validation result
 * @returns Human-readable summary
 */
export function getValidationSummary(result: SkillMarkdownValidationResult): string {
  const parts: string[] = [];

  if (result.valid) {
    parts.push('✓ All validations passed');
  } else {
    parts.push(`✗ Validation failed (${result.errors.length} errors)`);
  }

  if (!result.frontmatterValid) {
    parts.push('  - Frontmatter validation failed');
  }

  if (!result.contentValid) {
    parts.push('  - Content structure validation failed');
  }

  if (!result.codeBlocksValid) {
    parts.push('  - Code block validation failed');
  }

  if (!result.linksValid) {
    parts.push('  - Link validation failed');
  }

  if (result.warnings.length > 0) {
    parts.push(`  - ${result.warnings.length} warnings`);
  }

  return parts.join('\n');
}
