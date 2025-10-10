#!/usr/bin/env node

/**
 * Automated Changelog Generator
 * Generates changelog entries based on git commit history and conventional commits
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const currentVersion = packageJson.version;

class ChangelogGenerator {
  constructor() {
    this.changelogPath = path.join(rootDir, 'CHANGELOG.md');
    this.changelog = this.loadExistingChangelog();
    this.categories = {
      feat: 'Features',
      fix: 'Bug Fixes',
      docs: 'Documentation',
      style: 'Style Changes',
      refactor: 'Code Refactoring',
      perf: 'Performance Improvements',
      test: 'Testing',
      build: 'Build System',
      ci: 'Continuous Integration',
      chore: 'Chores',
      deps: 'Dependencies',
      security: 'Security',
      breaking: 'Breaking Changes'
    };
  }

  loadExistingChangelog() {
    try {
      if (fs.existsSync(this.changelogPath)) {
        const content = fs.readFileSync(this.changelogPath, 'utf8');
        const sections = content.split('\n## ');
        return {
          header: sections[0] || '',
          releases: sections.slice(1).map(section => {
            const lines = section.split('\n');
            const versionLine = lines[0];
            const version = versionLine.match(/\[(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]/)?.[1];
            const date = versionLine.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1];

            return {
              version,
              date,
              content: lines.slice(1).join('\n').trim()
            };
          })
        };
      }
    } catch (error) {
      console.warn('Warning: Could not load existing changelog:', error.message);
    }

    return {
      header: '# Changelog\n\nAll notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n',
      releases: []
    };
  }

  getGitHistory(sinceVersion) {
    try {
      const lastTag = this.getLastTag();
      let range = 'HEAD';

      if (sinceVersion && lastTag) {
        range = `${lastTag}..HEAD`;
      } else if (lastTag) {
        range = `${lastTag}..HEAD`;
      }

      const gitLog = execSync(
        `git log ${range} --pretty=format:"%H|%s|%b|%an|%ad" --date=short`,
        { encoding: 'utf8', cwd: rootDir }
      );

      return gitLog.trim().split('\n').map(line => {
        const [hash, subject, body, author, date] = line.split('|');
        return { hash, subject, body, author, date };
      });
    } catch (error) {
      console.warn('Warning: Could not get git history:', error.message);
      return [];
    }
  }

  getLastTag() {
    try {
      return execSync('git describe --tags --abbrev=0', { encoding: 'utf8', cwd: rootDir }).trim();
    } catch (error) {
      return null;
    }
  }

  parseCommit(commit) {
    const { subject, body, hash } = commit;

    // Parse conventional commit format
    const conventionalMatch = subject.match(/^(\w+)(\(.+\))?:\s*(.+)$/);
    if (!conventionalMatch) {
      return { type: 'chore', description: subject, breaking: false };
    }

    const [, type, scope, description] = conventionalMatch;
    const breaking = subject.includes('BREAKING CHANGE:') ||
                    (body && body.includes('BREAKING CHANGE:'));

    return {
      type: type.toLowerCase(),
      scope: scope ? scope.replace(/[()]/g, '') : null,
      description,
      breaking,
      body,
      hash: hash.substring(0, 7)
    };
  }

  categorizeCommits(commits) {
    const categorized = {};

    commits.forEach(commit => {
      const parsed = this.parseCommit(commit);
      let category = this.categories[parsed.type] || this.categories.chore;

      if (parsed.breaking) {
        category = this.categories.breaking;
      }

      if (!categorized[category]) {
        categorized[category] = [];
      }

      categorized[category].push(parsed);
    });

    return categorized;
  }

  formatReleaseEntry(version, date, categorizedCommits) {
    let entry = `## [${version}] - ${date}\n\n`;

    const order = [
      'Breaking Changes',
      'Features',
      'Bug Fixes',
      'Security',
      'Performance Improvements',
      'Documentation',
      'Code Refactoring',
      'Testing',
      'Build System',
      'Continuous Integration',
      'Dependencies',
      'Style Changes',
      'Chores'
    ];

    order.forEach(categoryName => {
      const commits = categorizedCommits[categoryName];
      if (commits && commits.length > 0) {
        entry += `### ${categoryName}\n\n`;

        commits.forEach(commit => {
          let line = `- ${commit.description}`;

          if (commit.scope) {
            line = `- **${commit.scope}:** ${commit.description}`;
          }

          if (commit.breaking) {
            line = `**${line}**`;
          }

          if (commit.hash) {
            line += ` (${commit.hash})`;
          }

          entry += line + '\n';

          // Add breaking change details
          if (commit.body && commit.body.includes('BREAKING CHANGE:')) {
            const breakingMatch = commit.body.match(/BREAKING CHANGE:\s*(.+)/s);
            if (breakingMatch) {
              entry += `  - Breaking change details: ${breakingMatch[1].trim()}\n`;
            }
          }
        });

        entry += '\n';
      }
    });

    return entry;
  }

  updateChangelog(newVersion, date = new Date().toISOString().split('T')[0]) {
    const commits = this.getGitHistory();
    const categorizedCommits = this.categorizeCommits(commits);

    if (Object.keys(categorizedCommits).length === 0) {
      console.log('No commits found to add to changelog');
      return;
    }

    const newEntry = this.formatReleaseEntry(newVersion, date, categorizedCommits);

    // Update changelog structure
    const newRelease = {
      version: newVersion,
      date,
      content: newEntry.replace(/^## \[.+\] - .+\n\n/, '')
    };

    // Insert new release at the beginning
    this.changelog.releases.unshift(newRelease);

    // Write updated changelog
    let content = this.changelog.header;
    this.changelog.releases.forEach(release => {
      content += `## [${release.version}] - ${release.date}\n\n`;
      content += release.content + '\n';
    });

    fs.writeFileSync(this.changelogPath, content, 'utf8');
    console.log(`✅ Changelog updated for version ${newVersion}`);

    // Show summary
    Object.entries(categorizedCommits).forEach(([category, commits]) => {
      console.log(`  ${category}: ${commits.length} commits`);
    });
  }

  validateChangelog() {
    try {
      const content = fs.readFileSync(this.changelogPath, 'utf8');

      // Check for required sections
      if (!content.includes('# Changelog')) {
        throw new Error('Changelog must have a header');
      }

      if (!content.includes('## [')) {
        throw new Error('Changelog must have at least one release section');
      }

      // Check for proper format
      const releaseSections = content.match(/## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})/g);
      if (!releaseSections) {
        throw new Error('Release sections must follow format: ## [version] - YYYY-MM-DD');
      }

      console.log('✅ Changelog validation passed');
      return true;
    } catch (error) {
      console.error('❌ Changelog validation failed:', error.message);
      return false;
    }
  }
}

// CLI Interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'update';

  const generator = new ChangelogGenerator();

  switch (command) {
    case 'update':
      const version = args[1] || currentVersion;
      const date = args[2] || new Date().toISOString().split('T')[0];
      generator.updateChangelog(version, date);
      break;

    case 'validate':
      generator.validateChangelog();
      break;

    case 'init':
      // Initialize changelog if it doesn't exist
      if (!fs.existsSync(generator.changelogPath)) {
        fs.writeFileSync(generator.changelogPath, generator.changelog.header, 'utf8');
        console.log('✅ Changelog initialized');
      } else {
        console.log('Changelog already exists');
      }
      break;

    default:
      console.log(`
Usage: node generate-changelog.js [command] [options]

Commands:
  update [version] [date]    Update changelog with new version (default: current package version)
  validate                  Validate changelog format and content
  init                      Initialize changelog file

Examples:
  node generate-changelog.js update
  node generate-changelog.js update 1.2.3 2024-01-15
  node generate-changelog.js validate
  node generate-changelog.js init
      `);
  }
}

main();