/**
 * YAML Frontmatter parser for Skill metadata
 */

import type { SkillMetadata, ValidationResult, MetadataParser } from './types';

export class SkillMetadataParser implements MetadataParser {
  /**
   * Parse YAML frontmatter from skill file content
   */
  parse(content: string): SkillMetadata {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      throw new Error('No frontmatter found in skill file (expected YAML between --- markers)');
    }

    const frontmatterContent = frontmatterMatch[1];
    return this.parseYAML(frontmatterContent);
  }

  /**
   * Parse YAML content into JavaScript object
   * Simple YAML parser for our specific use case
   */
  private parseYAML(yamlContent: string | undefined): SkillMetadata {
    if (!yamlContent) {
      return {} as SkillMetadata;
    }

    const metadata: Record<string, any> = {};

    const lines = yamlContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, colonIndex).trim();
      const valueStr = trimmed.substring(colonIndex + 1).trim();

      const value = this.parseYAMLValue(valueStr);
      metadata[key] = value;
    }

    return metadata as SkillMetadata;
  }

  /**
   * Parse individual YAML values with type inference
   */
  private parseYAMLValue(valueStr: string): any {
    if (!valueStr) {
      return null;
    }

    // Handle quoted strings
    if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
        (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
      return valueStr.slice(1, -1);
    }

    // Handle arrays [tag1, tag2]
    if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
      const arrayContent = valueStr.slice(1, -1);
      return arrayContent
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }

    // Handle booleans
    if (valueStr.toLowerCase() === 'true') {
      return true;
    }
    if (valueStr.toLowerCase() === 'false') {
      return false;
    }

    // Handle numbers
    if (/^\d+$/.test(valueStr)) {
      return parseInt(valueStr, 10);
    }
    if (/^\d+\.\d+$/.test(valueStr)) {
      return parseFloat(valueStr);
    }

    // Return as string
    return valueStr;
  }

  /**
   * Validate required metadata fields
   */
  validate(metadata: SkillMetadata): ValidationResult {
    const errors: string[] = [];

    if (!metadata.name) {
      errors.push('Missing required field: name');
    }

    if (!metadata.version) {
      errors.push('Missing required field: version');
    }

    if (!metadata.description) {
      errors.push('Missing required field: description');
    }

    // Validate version format if present
    if (metadata.version && !/^\d+\.\d+\.\d+$/.test(String(metadata.version))) {
      errors.push(
        `Invalid version format: ${metadata.version}. Expected MAJOR.MINOR.PATCH (e.g., 1.0.0)`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract specific field value or return null
   */
  extractField(content: string, fieldName: string): string | null {
    const match = content.match(new RegExp(`^${fieldName}:\\s*(.*)$`, 'm'));
    return match && match[1] ? match[1].trim() : null;
  }

  /**
   * Extract field with array handling
   */
  extractArrayField(content: string, fieldName: string): string[] {
    const match = content.match(new RegExp(`^${fieldName}:\\s*(\\[.+?\\])$`, 'm'));
    if (!match || !match[1]) {
      return [];
    }

    const arrayStr = match[1];
    const arrayContent = arrayStr.slice(1, -1);
    return arrayContent
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }
}
