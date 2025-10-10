#!/usr/bin/env node

/**
 * Release Announcement Script
 * Generates formatted release announcements for various platforms
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
const description = packageJson.description;
const repository = packageJson.repository;

class ReleaseAnnouncement {
  constructor() {
    this.packageName = packageName;
    this.version = version;
    this.description = description;
    this.repository = repository;
  }

  async generateAnnouncements() {
    console.log(`📢 Generating release announcements for ${this.packageName}@${this.version}`);

    const changelog = this.extractChangelogEntry();

    if (!changelog) {
      console.log('⚠️  No changelog entry found - generating basic announcement');
    }

    // Generate announcements for different platforms
    await this.generateGitHubAnnouncement(changelog);
    await this.generateTwitterAnnouncement(changelog);
    await this.generateSlackAnnouncement(changelog);
    await this.generateEmailAnnouncement(changelog);
    await this.generateDiscordAnnouncement(changelog);

    console.log('✅ All release announcements generated');
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
        changelogEntry = changelogEntry.replace(/^## \[[^\]]+\][\s\n]*/, '').trim();
        return changelogEntry;
      }

      return null;
    } catch (error) {
      console.log('⚠️  Error extracting changelog:', error.message);
      return null;
    }
  }

  async generateGitHubAnnouncement(changelog) {
    console.log('📝 Generating GitHub announcement...');

    const announcement = this.formatGitHubRelease(changelog);
    const filePath = path.join(rootDir, `RELEASE_ANNOUNCEMENT_GITHUB_v${this.version}.md`);

    fs.writeFileSync(filePath, announcement, 'utf8');
    console.log(`✅ GitHub announcement saved to ${filePath}`);

    // Also output to console for easy copy-paste
    console.log('\n📋 GitHub Release Content:');
    console.log('='.repeat(50));
    console.log(announcement);
    console.log('='.repeat(50));
  }

  formatGitHubRelease(changelog) {
    const date = new Date().toLocaleDateString();
    const repoUrl = this.repository.url.replace('git+https://github.com/', '').replace('.git', '');

    let content = `# 🎉 Release v${this.version}

**Published:** ${date}
**Package:** \`${this.packageName}\`
**Version:** \`${this.version}\`

## 📦 Installation

\`\`\`bash
npm install ${this.packageName}@${this.version}
\`\`\`

## 📖 Documentation

- [GitHub Repository](https://github.com/${repoUrl})
- [Documentation](https://github.com/${repoUrl}#readme)
- [Changelog](https://github.com/${repoUrl}/blob/main/CHANGELOG.md)

## ✨ What's New`;

    if (changelog) {
      content += `\n\n${changelog}`;
    } else {
      content += '\n\nThis release includes various improvements and bug fixes. See the [changelog](CHANGELOG.md) for detailed information.';
    }

    content += `

## 🙏 Acknowledgments

Thanks to everyone who contributed to this release!

---

**🔗 Links:**
- [NPM Package](https://www.npmjs.com/package/${this.packageName})
- [GitHub Issues](https://github.com/${repoUrl}/issues)
- [GitHub Discussions](https://github.com/${repoUrl}/discussions)

**⚠️ Note:** If you encounter any issues, please report them on [GitHub Issues](https://github.com/${repoUrl}/issues).`;

    return content;
  }

  async generateTwitterAnnouncement(changelog) {
    console.log('🐦 Generating Twitter announcement...');

    const announcement = this.formatTweet(changelog);
    const filePath = path.join(rootDir, `RELEASE_ANNOUNCEMENT_TWITTER_v${this.version}.txt`);

    fs.writeFileSync(filePath, announcement, 'utf8');
    console.log(`✅ Twitter announcement saved to ${filePath}`);

    console.log('\n🐦 Tweet Content:');
    console.log('='.repeat(50));
    console.log(announcement);
    console.log('='.repeat(50));
  }

  formatTweet(changelog) {
    const repoUrl = this.repository.url.replace('git+https://github.com/', '').replace('.git', '');
    const npmUrl = `https://www.npmjs.com/package/${this.packageName}`;

    // Extract key features from changelog for the tweet
    let highlights = '';
    if (changelog) {
      const features = changelog.match(/### Features\n\n((?:-.+\n?)*)/);
      if (features) {
        const featureList = features[1].split('\n')
          .filter(line => line.startsWith('-'))
          .slice(0, 2) // Take first 2 features
          .map(line => line.replace(/^-\s+/, ''));
        highlights = featureList.join(', ');
      }
    }

    const tweet = `🎉 ${this.packageName} v${this.version} is now live!

${highlights ? `✨ ${highlights}` : '🚀 New features and improvements'}

📦 Install: npm install ${this.packageName}@${this.version}
📖 Docs: https://github.com/${repoUrl}#readme
🔗 Package: ${npmUrl}

#JavaScript #NodeJS #OpenSource`;

    return tweet;
  }

  async generateSlackAnnouncement(changelog) {
    console.log('💬 Generating Slack announcement...');

    const announcement = this.formatSlackMessage(changelog);
    const filePath = path.join(rootDir, `RELEASE_ANNOUNCEMENT_SLACK_v${this.version}.json`);

    fs.writeFileSync(filePath, JSON.stringify(announcement, null, 2), 'utf8');
    console.log(`✅ Slack announcement saved to ${filePath}`);

    console.log('\n💬 Slack Message Content:');
    console.log('='.repeat(50));
    console.log(JSON.stringify(announcement, null, 2));
    console.log('='.repeat(50));
  }

  formatSlackMessage(changelog) {
    const repoUrl = this.repository.url.replace('git+https://github.com/', '').replace('.git', '');
    const npmUrl = `https://www.npmjs.com/package/${this.packageName}`;

    const message = {
      text: `🎉 New Release: ${this.packageName} v${this.version}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `🎉 ${this.packageName} v${this.version} Released!`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Package:* \`${this.packageName}\`\n*Version:* \`${this.version}\`\n*Description:* ${this.description}`
          }
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*📦 Installation:*"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `\`\`\`bash\nnpm install ${this.packageName}@${this.version}\n\`\`\``
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "📖 Documentation"
              },
              url: `https://github.com/${repoUrl}#readme`
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "📦 NPM Package"
              },
              url: npmUrl
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "📝 Changelog"
              },
              url: `https://github.com/${repoUrl}/blob/main/CHANGELOG.md`
            }
          ]
        }
      ]
    };

    // Add changelog highlights if available
    if (changelog) {
      const features = changelog.match(/### Features\n\n((?:-.+\n?)*)/);
      if (features) {
        const featureList = features[1].split('\n')
          .filter(line => line.startsWith('-'))
          .slice(0, 5) // Take first 5 features
          .map(line => line.replace(/^-\s+/, ''));

        if (featureList.length > 0) {
          message.blocks.splice(3, 0, {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*✨ Key Features:*\n" + featureList.map(f => `• ${f}`).join('\n')
            }
          });
        }
      }
    }

    return message;
  }

  async generateEmailAnnouncement(changelog) {
    console.log('📧 Generating email announcement...');

    const announcement = this.formatEmail(changelog);
    const filePath = path.join(rootDir, `RELEASE_ANNOUNCEMENT_EMAIL_v${this.version}.html`);

    fs.writeFileSync(filePath, announcement, 'utf8');
    console.log(`✅ Email announcement saved to ${filePath}`);

    console.log('\n📧 Email Content (preview):');
    console.log('='.repeat(50));
    console.log(this.stripHtml(announcement.substring(0, 500)) + '...');
    console.log('='.repeat(50));
  }

  formatEmail(changelog) {
    const repoUrl = this.repository.url.replace('git+https://github.com/', '').replace('.git', '');
    const npmUrl = `https://www.npmjs.com/package/${this.packageName}`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${this.packageName} v${this.version} Released</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; }
        .header { background: #f8f9fa; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .install-box { background: #f1f3f4; padding: 15px; border-radius: 5px; font-family: monospace; }
        .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 ${this.packageName} v${this.version} Released!</h1>
        <p>${this.description}</p>
    </div>

    <div class="content">
        <h2>📦 Installation</h2>
        <div class="install-box">
            npm install ${this.packageName}@${this.version}
        </div>

        <h2>📖 Resources</h2>
        <p>
            <a href="https://github.com/${repoUrl}#readme" class="button">Documentation</a>
            <a href="${npmUrl}" class="button">NPM Package</a>
            <a href="https://github.com/${repoUrl}/blob/main/CHANGELOG.md" class="button">Changelog</a>
        </p>

        <h2>✨ What's New</h2>
        <div>
            ${changelog ? changelog.replace(/\n/g, '<br>') : 'This release includes various improvements and bug fixes.'}
        </div>
    </div>

    <div class="footer">
        <p>You're receiving this email because you subscribed to updates about ${this.packageName}.</p>
        <p><a href="https://github.com/${repoUrl}">Unsubscribe</a></p>
    </div>
</body>
</html>`;
  }

  async generateDiscordAnnouncement(changelog) {
    console.log('🎮 Generating Discord announcement...');

    const announcement = this.formatDiscordMessage(changelog);
    const filePath = path.join(rootDir, `RELEASE_ANNOUNCEMENT_DISCORD_v${this.version}.txt`);

    fs.writeFileSync(filePath, announcement, 'utf8');
    console.log(`✅ Discord announcement saved to ${filePath}`);

    console.log('\n🎮 Discord Message Content:');
    console.log('='.repeat(50));
    console.log(announcement);
    console.log('='.repeat(50));
  }

  formatDiscordMessage(changelog) {
    const repoUrl = this.repository.url.replace('git+https://github.com/', '').replace('.git', '');
    const npmUrl = `https://www.npmjs.com/package/${this.packageName}`;

    let message = `🎉 **${this.packageName} v${this.version} Released!** 🎉

**Package:** \`${this.packageName}\`
**Version:** \`${this.version}\`

**Installation:**
\`\`\`bash
npm install ${this.packageName}@${this.version}
\`\`\`

**Links:**
📖 [Documentation](https://github.com/${repoUrl}#readme)
📦 [NPM Package](${npmUrl})
📝 [Changelog](https://github.com/${repoUrl}/blob/main/CHANGELOG.md)`;

    if (changelog) {
      const features = changelog.match(/### Features\n\n((?:-.+\n?)*)/);
      if (features) {
        const featureList = features[1].split('\n')
          .filter(line => line.startsWith('-'))
          .slice(0, 5)
          .map(line => line.replace(/^-\s+/, ''));

        if (featureList.length > 0) {
          message += `\n\n**✨ Key Features:**\n${featureList.map(f => `• ${f}`).join('\n')}`;
        }
      }
    }

    message += '\n\n*If you encounter any issues, please report them on [GitHub Issues](https://github.com/' + repoUrl + '/issues).*';

    return message;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }
}

// CLI Interface
async function main() {
  const announcer = new ReleaseAnnouncement();
  await announcer.generateAnnouncements();
}

main().catch(error => {
  console.error('❌ Announcement generation failed:', error);
  process.exit(1);
});