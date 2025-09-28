#!/usr/bin/env node

/**
 * CLAUDE-SOUL.md Slash Command
 *
 * Generate a project soul document - the why, what, and how of the project
 * A sparse language doc limited to 500 lines focusing on project essence
 */

import fs from 'fs/promises';
import path from 'path';

export class ClaudeSoulSlashCommand {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.claudeSoulPath = path.join(projectPath, 'claude-soul.md');
  }

  /**
   * Main slash command execution
   */
  async execute(options = {}) {
    const {
      backup = true,
      preview = false,
      force = false
    } = options;

    try {
      console.log('🚀 Generating claude-soul.md...');

      // Step 1: Generate soul content
      const soulContent = await this.generateSoulContent();

      // Step 2: Handle preview mode
      if (preview) {
        return {
          success: true,
          action: 'preview',
          content: soulContent,
          message: 'Preview generated successfully'
        };
      }

      // Step 3: Check for existing file
      const existingSoulExists = await this.fileExists(this.claudeSoulPath);

      // Step 4: Handle force/confirmation for existing files
      if (existingSoulExists && !force) {
        const shouldOverwrite = await this.confirmOverwrite();
        if (!shouldOverwrite) {
          return {
            success: false,
            action: 'cancelled',
            message: 'Generation cancelled by user'
          };
        }
      }

      // Step 5: Create backup if requested
      if (backup && existingSoulExists) {
        await this.createBackup();
      }

      // Step 6: Write the file
      await fs.writeFile(this.claudeSoulPath, soulContent, 'utf8');

      console.log('✅ claude-soul.md generated successfully');
      return {
        success: true,
        action: 'generated',
        file: 'claude-soul.md',
        length: soulContent.length,
        lineCount: soulContent.split('\n').length
      };

    } catch (error) {
      console.error('❌ claude-soul.md generation failed:', error.message);
      return {
        success: false,
        action: 'error',
        error: error.message
      };
    }
  }

  /**
   * Generate the soul content by analyzing the project
   */
  async generateSoulContent() {
    const projectAnalysis = await this.analyzeProject();

    return `# ${projectAnalysis.name} - Project Soul

> **AI Context**: This document contains the project's essence, purpose, and philosophy. Use this context to understand project goals, make consistent decisions about code and architecture, and maintain alignment with project values throughout development.

## WHY - The Purpose

### Core Mission
${projectAnalysis.mission}

### Problem We Solve
${projectAnalysis.problem}

### Vision
${projectAnalysis.vision}

## WHAT - The Essence

### Project Identity
- **Type**: ${projectAnalysis.type}
- **Domain**: ${projectAnalysis.domain}
- **Scope**: ${projectAnalysis.scope}

### Core Capabilities
${projectAnalysis.capabilities.map(cap => `- ${cap}`).join('\n')}

### Key Features
${projectAnalysis.features.map(feature => `- ${feature}`).join('\n')}

### Architecture Philosophy
${projectAnalysis.architecture}

## HOW - The Approach

### Development Methodology
${projectAnalysis.methodology}

### Technology Stack
${projectAnalysis.techStack.map(tech => `- ${tech}`).join('\n')}

### Code Principles
${projectAnalysis.principles.map(principle => `- ${principle}`).join('\n')}

### Quality Standards
${projectAnalysis.quality}

## SOUL - The Spirit

### Values
${projectAnalysis.values.map(value => `- ${value}`).join('\n')}

### Community
${projectAnalysis.community}

### Future Vision
${projectAnalysis.future}

### Legacy Goals
${projectAnalysis.legacy}

---

> **For AI Assistants**: Reference this document when writing code, suggesting architecture changes, or making technical decisions. Ensure all recommendations align with the project's mission, values, and technical approach outlined above.

*Generated: ${new Date().toISOString().split('T')[0]} | Limit: 500 lines | Last updated: ${new Date().toLocaleDateString()}*
`;
  }

  /**
   * Analyze the project to extract its soul
   */
  async analyzeProject() {
    const packageInfo = await this.getPackageInfo();
    const repoInfo = await this.getRepositoryInfo();
    const codebaseInfo = await this.getCodebaseInfo();

    // Generate project analysis
    return {
      name: packageInfo.name || path.basename(this.projectPath),
      mission: this.inferMission(packageInfo, repoInfo),
      problem: this.inferProblem(packageInfo, codebaseInfo),
      vision: this.inferVision(packageInfo, repoInfo),
      type: this.inferProjectType(packageInfo, codebaseInfo),
      domain: this.inferDomain(packageInfo, codebaseInfo),
      scope: this.inferScope(packageInfo, codebaseInfo),
      capabilities: this.inferCapabilities(packageInfo, codebaseInfo),
      features: this.inferFeatures(packageInfo, codebaseInfo),
      architecture: this.inferArchitecture(codebaseInfo),
      methodology: this.inferMethodology(codebaseInfo),
      techStack: this.inferTechStack(packageInfo, codebaseInfo),
      principles: this.inferPrinciples(codebaseInfo),
      quality: this.inferQuality(packageInfo, codebaseInfo),
      values: this.inferValues(packageInfo, repoInfo),
      community: this.inferCommunity(packageInfo, repoInfo),
      future: this.inferFuture(packageInfo, repoInfo),
      legacy: this.inferLegacy(packageInfo, repoInfo)
    };
  }

  /**
   * Get package.json information
   */
  async getPackageInfo() {
    try {
      const packagePath = path.join(this.projectPath, 'package.json');
      const packageContent = await fs.readFile(packagePath, 'utf8');
      return JSON.parse(packageContent);
    } catch {
      return {};
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo() {
    const info = { hasGit: false, files: [] };

    try {
      await fs.access(path.join(this.projectPath, '.git'));
      info.hasGit = true;
    } catch {}

    try {
      const files = await fs.readdir(this.projectPath);
      info.files = files;
    } catch {}

    return info;
  }

  /**
   * Get codebase structure information
   */
  async getCodebaseInfo() {
    const info = {
      directories: [],
      languages: new Set(),
      configFiles: [],
      testFiles: [],
      hasTests: false,
      hasDocumentation: false
    };

    try {
      const entries = await fs.readdir(this.projectPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          info.directories.push(entry.name);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          const name = entry.name.toLowerCase();

          // Track languages
          const languageMap = {
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.py': 'Python',
            '.go': 'Go',
            '.rs': 'Rust',
            '.java': 'Java',
            '.cpp': 'C++',
            '.c': 'C'
          };

          if (languageMap[ext]) {
            info.languages.add(languageMap[ext]);
          }

          // Track config files
          if (name.includes('config') || name.includes('.json') ||
              name.includes('.yml') || name.includes('.yaml')) {
            info.configFiles.push(entry.name);
          }

          // Track test files
          if (name.includes('test') || name.includes('spec')) {
            info.testFiles.push(entry.name);
            info.hasTests = true;
          }

          // Track documentation
          if (ext === '.md' || name.includes('readme') || name.includes('doc')) {
            info.hasDocumentation = true;
          }
        }
      }
    } catch {}

    return info;
  }

  // Inference methods
  inferMission(pkg, repo) {
    if (pkg.description) {
      return pkg.description;
    }

    const name = pkg.name || path.basename(this.projectPath);

    if (name.includes('flow') || name.includes('orchestrat')) {
      return "Orchestrate and coordinate complex workflows with intelligent automation";
    }
    if (name.includes('api') || name.includes('server')) {
      return "Provide robust API services and server-side functionality";
    }
    if (name.includes('cli') || name.includes('tool')) {
      return "Deliver powerful command-line tools for developer productivity";
    }

    return "Solve complex problems through innovative software solutions";
  }

  inferProblem(pkg, codebase) {
    if (pkg.name?.includes('flow')) {
      return "Complex multi-agent coordination and workflow orchestration requires simplified interfaces while maintaining advanced capabilities";
    }
    if (codebase.languages.has('TypeScript') && codebase.hasTests) {
      return "Enterprise-grade development workflows need reliable, type-safe, and well-tested solutions";
    }
    return "Modern software development requires efficient, maintainable, and scalable solutions";
  }

  inferVision(pkg, repo) {
    if (pkg.name?.includes('novice')) {
      return "Democratize advanced technology by making it accessible to users of all skill levels";
    }
    return "Create software that empowers users and teams to achieve more with less complexity";
  }

  inferProjectType(pkg, codebase) {
    if (pkg.bin) return "CLI Tool";
    if (codebase.directories.includes('src') && codebase.directories.includes('tests')) return "Library/Framework";
    if (pkg.dependencies?.express || pkg.dependencies?.fastify) return "Web Service";
    if (codebase.languages.has('TypeScript')) return "TypeScript Application";
    return "Software Project";
  }

  inferDomain(pkg, codebase) {
    const name = (pkg.name || '').toLowerCase();
    if (name.includes('flow') || name.includes('orchestrat')) return "Workflow Orchestration";
    if (name.includes('ai') || name.includes('ml')) return "Artificial Intelligence";
    if (name.includes('api') || name.includes('web')) return "Web Development";
    if (name.includes('cli') || name.includes('tool')) return "Developer Tools";
    return "Software Development";
  }

  inferScope(pkg, codebase) {
    const dirCount = codebase.directories.length;
    const langCount = codebase.languages.size;

    if (dirCount > 10 && langCount > 2) return "Enterprise-scale multi-language platform";
    if (dirCount > 5) return "Medium-scale application with modular architecture";
    return "Focused tool with clear boundaries";
  }

  inferCapabilities(pkg, codebase) {
    const caps = [];

    if (pkg.bin) caps.push("Command-line interface execution");
    if (codebase.hasTests) caps.push("Automated testing and validation");
    if (codebase.languages.has('TypeScript')) caps.push("Type-safe development");
    if (pkg.dependencies?.sqlite3) caps.push("Persistent data storage");
    if (pkg.scripts?.build) caps.push("Build and compilation");
    if (pkg.name?.includes('flow')) caps.push("Workflow orchestration and automation");

    return caps.length > 0 ? caps : ["Core functionality delivery", "Modular architecture"];
  }

  inferFeatures(pkg, codebase) {
    const features = new Set();

    if (pkg.scripts) {
      Object.keys(pkg.scripts).forEach(script => {
        if (script.includes('test') && !features.has("testing")) {
          features.add("Comprehensive testing suite");
          features.add("testing");
        }
        if (script.includes('build') && !features.has("build")) {
          features.add("Automated build system");
          features.add("build");
        }
        if (script.includes('dev') && !features.has("dev")) {
          features.add("Development workflow tools");
          features.add("dev");
        }
      });
    }

    if (codebase.configFiles.length > 0) features.add("Flexible configuration system");
    if (codebase.hasDocumentation) features.add("Comprehensive documentation");

    // Filter out the marker keys and return as array
    const filteredFeatures = Array.from(features).filter(f =>
      f !== "testing" && f !== "build" && f !== "dev"
    );

    return filteredFeatures.length > 0 ? filteredFeatures : ["Modular design", "Clean architecture"];
  }

  inferArchitecture(codebase) {
    if (codebase.directories.includes('src') && codebase.directories.includes('dist')) {
      return "Source-to-distribution compilation with clear separation of concerns";
    }
    if (codebase.directories.includes('lib') || codebase.directories.includes('src')) {
      return "Modular architecture with logical component separation";
    }
    return "Clean, maintainable structure following best practices";
  }

  inferMethodology(codebase) {
    if (codebase.hasTests && codebase.directories.includes('src')) {
      return "Test-driven development with continuous integration";
    }
    if (codebase.hasTests) {
      return "Quality-first development with automated validation";
    }
    return "Iterative development with focus on maintainability";
  }

  inferTechStack(pkg, codebase) {
    const stack = [];

    Array.from(codebase.languages).forEach(lang => stack.push(lang));

    if (pkg.dependencies?.sqlite3) stack.push("SQLite Database");
    if (pkg.dependencies?.express) stack.push("Express.js");
    if (pkg.dependencies?.react) stack.push("React");
    if (pkg.devDependencies?.jest) stack.push("Jest Testing");
    if (pkg.devDependencies?.typescript) stack.push("TypeScript Compiler");

    return stack.length > 0 ? stack : ["Modern JavaScript/TypeScript ecosystem"];
  }

  inferPrinciples(codebase) {
    const principles = ["Clean, readable code"];

    if (codebase.hasTests) principles.push("Test-driven development");
    if (codebase.languages.has('TypeScript')) principles.push("Type safety and static analysis");
    if (codebase.directories.includes('src')) principles.push("Separation of concerns");

    principles.push("Progressive enhancement");
    principles.push("Documentation-first approach");

    return principles;
  }

  inferQuality(pkg, codebase) {
    let quality = "High standards with ";

    if (codebase.hasTests) quality += "comprehensive testing, ";
    if (codebase.languages.has('TypeScript')) quality += "type safety, ";
    if (pkg.scripts?.lint) quality += "linting, ";

    quality += "and continuous improvement";

    return quality;
  }

  inferValues(pkg, repo) {
    const values = ["Simplicity without sacrificing power"];

    if (pkg.name?.includes('novice')) values.push("Accessibility for all skill levels");
    if (pkg.license === 'MIT') values.push("Open source collaboration");

    values.push("Quality over quantity");
    values.push("User-centric design");

    return values;
  }

  inferCommunity(pkg, repo) {
    if (pkg.repository?.url) {
      return `Open source project welcoming contributions. Repository: ${pkg.repository.url}`;
    }
    return "Collaborative development with focus on shared learning and improvement";
  }

  inferFuture(pkg, repo) {
    if (pkg.name?.includes('flow')) {
      return "Evolve into the premier platform for accessible AI workflow orchestration";
    }
    return "Continuous evolution to meet emerging developer needs and technological advances";
  }

  inferLegacy(pkg, repo) {
    return "Create lasting impact by making complex technology accessible and empowering developers to build amazing things";
  }

  /**
   * Create backup of existing file
   */
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.projectPath, `claude-soul.md.backup.${timestamp}`);

      const existingContent = await fs.readFile(this.claudeSoulPath, 'utf8');
      await fs.writeFile(backupPath, existingContent, 'utf8');

      console.log(`📄 Backup created: ${path.basename(backupPath)}`);
    } catch (error) {
      console.warn(`⚠️ Could not create backup: ${error.message}`);
    }
  }

  /**
   * Simple confirmation prompt for overwriting existing files
   */
  async confirmOverwrite() {
    console.log('⚠️ claude-soul.md exists. Use --force to overwrite or --preview to see changes.');
    return false;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Show preview of what would be generated
   */
  async showPreview() {
    const result = await this.execute({ preview: true });

    if (result.success) {
      console.log('📄 claude-soul.md Preview:');
      console.log('━'.repeat(50));
      console.log(result.content.substring(0, 1500) + '...');
      console.log('━'.repeat(50));
      console.log(`📊 Total length: ${result.content.length} characters`);
      console.log(`📏 Lines: ${result.content.split('\n').length}`);
    }

    return result;
  }
}

/**
 * CLI Interface for slash command
 */
export async function executeClaudeSoulCommand(args = {}) {
  const command = new ClaudeSoulSlashCommand();

  // Handle different command modes
  if (args.preview) {
    return await command.showPreview();
  }

  // Default: generate claude-soul.md
  return await command.execute(args);
}

// For direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {
    preview: process.argv.includes('--preview'),
    force: process.argv.includes('--force'),
    backup: !process.argv.includes('--no-backup')
  };

  executeClaudeSoulCommand(args);
}