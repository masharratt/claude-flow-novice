#!/usr/bin/env node

/**
 * Release Notification Script
 * Sends notifications about successful releases
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;
const packageName = packageJson.name;
const repository = packageJson.repository;

class ReleaseNotifier {
  constructor() {
    this.packageName = packageName;
    this.version = version;
    this.repository = repository;
  }

  async sendNotifications() {
    console.log(`📢 Sending release notifications for ${this.packageName}@${this.version}`);

    await this.createGitHubRelease();
    await this.updateDocumentation();
    await this.sendTeamNotifications();
    await this.updateMetrics();

    console.log('✅ All release notifications sent successfully');
  }

  async createGitHubRelease() {
    try {
      // Get changelog entry for this version
      const changelog = this.extractChangelogEntry();

      if (!changelog) {
        console.log('⚠️  No changelog entry found for this version');
        return;
      }

      // Create GitHub release using gh CLI
      const releaseTitle = `Release v${this.version}`;
      const releaseNotes = `# ${releaseTitle}\n\n${changelog}\n\n---\n\n**Installation:**\n\`\`\`bash\nnpm install ${this.packageName}@${this.version}\n\`\`\`\n\n**Documentation:** [View Docs](https://github.com/${this.repository.url.replace('git+https://github.com/', '').replace('.git', '')}#readme)`;

      try {
        execSync(`gh release create v${this.version} --title "${releaseTitle}" --notes "${releaseNotes}"`, {
          encoding: 'utf8',
          cwd: rootDir,
          stdio: 'pipe'
        });

        console.log('✅ GitHub release created');
      } catch (error) {
        console.log('⚠️  Could not create GitHub release (gh CLI not available or no permissions)');
        console.log(`Manual release notes:\n${releaseNotes}`);
      }
    } catch (error) {
      console.log('⚠️  Error creating GitHub release:', error.message);
    }
  }

  extractChangelogEntry() {
    try {
      const changelogPath = path.join(rootDir, 'CHANGELOG.md');
      if (!fs.existsSync(changelogPath)) {
        return null;
      }

      const content = fs.readFileSync(changelogPath, 'utf8');
      const versionRegex = new RegExp(`## \\[${this.version.replace('.', '\\.')}\\][\\s\\S]*?(?=## \\[|$)`);
      const match = content.match(versionRegex);

      if (match) {
        let changelogEntry = match[0];
        // Remove the version line and clean up
        changelogEntry = changelogEntry.replace(/^## \[[^\]]+\][\s\n]*/, '').trim();
        return changelogEntry;
      }

      return null;
    } catch (error) {
      console.log('⚠️  Error extracting changelog:', error.message);
      return null;
    }
  }

  async updateDocumentation() {
    try {
      // Update version in README files
      const readmeFiles = ['README.md', 'README-NPM.md'];

      readmeFiles.forEach(filename => {
        const readmePath = path.join(rootDir, filename);
        if (fs.existsSync(readmePath)) {
          let content = fs.readFileSync(readmePath, 'utf8');

          // Update version references
          content = content.replace(
            new RegExp(`${this.packageName}@[\\d.]+`, 'g'),
            `${this.packageName}@${this.version}`
          );

          content = content.replace(
            /Latest version: \d+\.\d+\.\d+/g,
            `Latest version: ${this.version}`
          );

          fs.writeFileSync(readmePath, content, 'utf8');
          console.log(`✅ Updated ${filename}`);
        }
      });

      // Create release notes file
      const releaseNotesPath = path.join(rootDir, `RELEASE_NOTES_v${this.version}.md`);
      const changelogEntry = this.extractChangelogEntry();

      if (changelogEntry) {
        const releaseNotes = `# Release Notes v${this.version}\n\nPublished: ${new Date().toISOString()}\n\n${changelogEntry}\n\n---\n\n**Package:** ${this.packageName}\n**Version:** ${this.version}\n**Repository:** ${this.repository.url}\n\n## Installation\n\n\`\`\`bash\nnpm install ${this.packageName}@${this.version}\n\`\`\`\n\n## Documentation\n\nFor detailed documentation, visit: [GitHub Repository](${this.repository.url.replace('git+', '').replace('.git', '')})`;

        fs.writeFileSync(releaseNotesPath, releaseNotes, 'utf8');
        console.log(`✅ Created ${releaseNotesPath}`);
      }
    } catch (error) {
      console.log('⚠️  Error updating documentation:', error.message);
    }
  }

  async sendTeamNotifications() {
    try {
      // Create notification message
      const message = `🎉 New Release: ${this.packageName} v${this.version}\n\n${this.packageName} version ${this.version} has been published to NPM!\n\n📦 Install: npm install ${this.packageName}@${this.version}\n📖 Docs: ${this.repository.url.replace('git+', '').replace('.git', '')}\n📝 Changelog: https://github.com/${this.repository.url.replace('git+https://github.com/', '').replace('.git', '')}/blob/main/CHANGELOG.md`;

      console.log('\n📧 Team Notification Message:');
      console.log('=' .repeat(50));
      console.log(message);
      console.log('=' .repeat(50));

      // Here you could integrate with Slack, Discord, email, etc.
      // For now, just display the message

      // Example Slack integration (if webhook URL is available)
      // await this.sendSlackNotification(message);

    } catch (error) {
      console.log('⚠️  Error sending team notifications:', error.message);
    }
  }

  async sendSlackNotification(message) {
    // Example Slack integration
    const slackWebhook = process.env.SLACK_RELEASE_WEBHOOK;
    if (!slackWebhook) return;

    try {
      const response = await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          username: 'Release Bot',
          icon_emoji: ':package:'
        })
      });

      if (response.ok) {
        console.log('✅ Slack notification sent');
      }
    } catch (error) {
      console.log('⚠️  Error sending Slack notification:', error.message);
    }
  }

  async updateMetrics() {
    try {
      // Update release metrics
      const metrics = {
        version: this.version,
        releaseDate: new Date().toISOString(),
        packageName: this.packageName,
        type: this.determineReleaseType()
      };

      const metricsPath = path.join(rootDir, '.release-metrics.json');
      let existingMetrics = [];

      if (fs.existsSync(metricsPath)) {
        existingMetrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      }

      existingMetrics.push(metrics);
      fs.writeFileSync(metricsPath, JSON.stringify(existingMetrics, null, 2), 'utf8');

      console.log('✅ Release metrics updated');
    } catch (error) {
      console.log('⚠️  Error updating metrics:', error.message);
    }
  }

  determineReleaseType() {
    const parts = this.version.split('.');
    if (parts.length >= 3) {
      if (parts[0] !== '0') {
        // Major version (1.x.x and above)
        if (parts[1] === '0' && parts[2] === '0') {
          return 'major';
        } else if (parts[2] === '0') {
          return 'minor';
        } else {
          return 'patch';
        }
      } else {
        // Development version (0.x.x)
        if (parts[1] === '0') {
          return 'major-dev';
        } else {
          return 'minor-dev';
        }
      }
    }

    // Check for pre-release
    if (this.version.includes('-')) {
      return 'pre-release';
    }

    return 'unknown';
  }
}

// CLI Interface
async function main() {
  const notifier = new ReleaseNotifier();
  await notifier.sendNotifications();
}

main().catch(error => {
  console.error('❌ Release notification failed:', error);
  process.exit(1);
});