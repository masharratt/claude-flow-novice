#!/usr/bin/env node

/**
 * Changelog Validation Script
 * Validates that changelog follows proper format and contains required information
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

class ChangelogValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  validate() {
    console.log('🔍 Validating changelog...');

    if (!fs.existsSync(changelogPath)) {
      this.errors.push('CHANGELOG.md file does not exist');
      return this.report();
    }

    const content = fs.readFileSync(changelogPath, 'utf8');
    const lines = content.split('\n');

    this.validateStructure(content);
    this.validateVersions(content);
    this.validateDates(content);
    this.validateContent(content);

    return this.report();
  }

  validateStructure(content) {
    // Check for header
    if (!content.includes('# Changelog')) {
      this.errors.push('Changelog must start with "# Changelog" header');
    }

    // Check for Keep a Changelog and Semantic Versioning mentions
    if (!content.includes('Keep a Changelog')) {
      this.warnings.push('Consider mentioning "Keep a Changelog" format');
    }

    if (!content.includes('Semantic Versioning')) {
      this.warnings.push('Consider mentioning "Semantic Versioning" compliance');
    }
  }

  validateVersions(content) {
    // Extract all version sections
    const versionSections = content.match(/## \[([^\]]+)\]/g);

    if (!versionSections) {
      this.errors.push('No version sections found. Use format: ## [version]');
      return;
    }

    // Validate version format (semver)
    const versions = content.match(/## \[([^\]]+)\]/g).map(section =>
      section.match(/## \[([^\]]+)\]/)[1]
    );

    versions.forEach((version, index) => {
      // Skip Unreleased section
      if (version === 'Unreleased') return;

      // Check semver format
      const semverRegex = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
      if (!semverRegex.test(version)) {
        this.errors.push(`Invalid version format: ${version}. Expected semver format (x.y.z)`);
      }

      // Check for duplicate versions
      if (versions.indexOf(version) !== index) {
        this.errors.push(`Duplicate version found: ${version}`);
      }
    });

    // Check that versions are in descending order (newest first)
    const releaseVersions = versions.filter(v => v !== 'Unreleased');
    for (let i = 0; i < releaseVersions.length - 1; i++) {
      const current = releaseVersions[i];
      const next = releaseVersions[i + 1];

      // Simple version comparison (could use semver package for more robust comparison)
      if (this.compareVersions(current, next) < 0) {
        this.warnings.push(`Versions should be in descending order: ${current} appears before ${next}`);
      }
    }
  }

  validateDates(content) {
    // Extract dates from version sections
    const datePattern = /## \[[^\]]+\] - (\d{4}-\d{2}-\d{2})/g;
    const dates = [];
    let match;

    while ((match = datePattern.exec(content)) !== null) {
      dates.push(new Date(match[1]));
    }

    dates.forEach((date, index) => {
      // Check if date is valid
      if (isNaN(date.getTime())) {
        this.errors.push(`Invalid date format found: ${match[1]}. Use YYYY-MM-DD format`);
      }

      // Check if date is in the future
      if (date > new Date()) {
        this.warnings.push(`Date is in the future: ${match[1]}`);
      }

      // Check chronological order
      if (index > 0 && dates[index - 1] < date) {
        this.warnings.push(`Dates should be in descending order: ${match[1]} appears after earlier date`);
      }
    });
  }

  validateContent(content) {
    const lines = content.split('\n');
    let inVersionSection = false;
    let hasChanges = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('## [')) {
        if (inVersionSection && !hasChanges) {
          this.warnings.push(`Version section appears to have no changes (line ${i + 1})`);
        }
        inVersionSection = true;
        hasChanges = false;
        continue;
      }

      if (line.startsWith('##') && !line.startsWith('## [')) {
        if (inVersionSection && !hasChanges) {
          this.warnings.push(`Version section appears to have no changes (line ${i + 1})`);
        }
        inVersionSection = false;
        continue;
      }

      if (inVersionSection && (line.startsWith('-') || line.startsWith('*'))) {
        hasChanges = true;

        // Validate change entry format
        if (!line.match(/^[-*]\s+.+/)) {
          this.warnings.push(`Change entry format could be improved: "${line}" (line ${i + 1})`);
        }
      }
    }

    // Check for common section headings
    const commonSections = ['Features', 'Bug Fixes', 'Security', 'Performance', 'Documentation'];
    let hasStandardSections = false;

    commonSections.forEach(section => {
      if (content.includes(`### ${section}`)) {
        hasStandardSections = true;
      }
    });

    if (!hasStandardSections) {
      this.warnings.push('Consider using standard section headings (Features, Bug Fixes, etc.)');
    }

    // Check for empty sections
    const sectionMatches = content.match(/### .+\n\n###/g) || content.match(/### .+\n\n##/g);
    if (sectionMatches) {
      this.warnings.push('Found empty sections - consider removing them');
    }
  }

  compareVersions(a, b) {
    // Simple semver comparison (could use semver package)
    const aParts = a.replace(/-.+$/, '').split('.').map(Number);
    const bParts = b.replace(/-.+$/, '').split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  report() {
    console.log('\n📋 Changelog Validation Report');
    console.log('================================');

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ Changelog validation passed with no issues!');
      return true;
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ Errors (${this.errors.length}):`);
      this.errors.forEach(error => {
        console.log(`  • ${error}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${this.warnings.length}):`);
      this.warnings.forEach(warning => {
        console.log(`  • ${warning}`);
      });
    }

    if (this.errors.length > 0) {
      console.log('\n❌ Validation failed. Please fix the errors before releasing.');
      return false;
    } else {
      console.log('\n⚠️  Validation passed with warnings. Consider addressing them.');
      return true;
    }
  }
}

// CLI Interface
function main() {
  const validator = new ChangelogValidator();
  const isValid = validator.validate();
  process.exit(isValid ? 0 : 1);
}

main();