import fs from 'fs/promises';
import path from 'path';
import { LanguageDetector } from './language-detector.js';
import { ClaudeMdGenerator } from './claude-md-generator.js';

/**
 * Integration System for Language Detection and CLAUDE.md Generation
 *
 * Orchestrates the complete workflow from project analysis to CLAUDE.md creation
 * Handles project initialization, updates, and user preferences
 */
export class IntegrationSystem {
  constructor(projectPath = process.cwd(), options = {}) {
    this.projectPath = projectPath;
    this.options = {
      autoDetect: true,
      autoGenerate: true,
      watchForChanges: false,
      backupExisting: true,
      ...options
    };

    this.detector = new LanguageDetector(projectPath);
    this.generator = new ClaudeMdGenerator(projectPath, options);
    this.preferencesPath = path.join(projectPath, '.claude-flow-novice', 'preferences');
    this.configPath = path.join(this.preferencesPath, 'integration.json');
  }

  /**
   * Main initialization method - sets up the entire system
   */
  async initialize() {
    console.log('🚀 Initializing Claude Flow language detection and CLAUDE.md generation...');

    try {
      // Step 1: Ensure directories exist
      await this.ensureDirectoryStructure();

      // Step 2: Load existing configuration
      const config = await this.loadConfiguration();

      // Step 3: Check if auto-detection is enabled
      if (!config.autoDetect) {
        console.log('⏭️  Auto-detection disabled, skipping...');
        return { skipped: true, reason: 'Auto-detection disabled' };
      }

      // Step 4: Detect project languages and frameworks
      console.log('🔍 Detecting project languages and frameworks...');
      const detectionResults = await this.detector.detectProject();

      // Step 5: Check if we need to generate CLAUDE.md
      const shouldGenerate = await this.shouldGenerateClaudeMd(detectionResults, config);

      if (!shouldGenerate.generate) {
        console.log(`⏭️  ${shouldGenerate.reason}`);
        return { skipped: true, reason: shouldGenerate.reason, detection: detectionResults };
      }

      // Step 6: Generate CLAUDE.md
      console.log('📝 Generating CLAUDE.md...');
      const claudeContent = await this.generator.generateClaudeMd();

      // Step 7: Save current detection results for future comparisons
      await this.saveDetectionResults(detectionResults);

      // Step 8: Update configuration with last generation info
      await this.updateConfiguration({
        ...config,
        lastGenerated: new Date().toISOString(),
        lastDetection: detectionResults
      });

      // Step 9: Setup file watching if enabled
      if (config.watchForChanges) {
        await this.setupFileWatcher();
      }

      console.log('✅ Integration system initialized successfully');

      return {
        success: true,
        detection: detectionResults,
        claudeGenerated: true,
        contentLength: claudeContent.length
      };

    } catch (error) {
      console.error(`❌ Integration system initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update system when new technologies are detected
   */
  async updateForNewTechnology() {
    console.log('🔄 Checking for new technologies...');

    try {
      const currentDetection = await this.detector.detectProject();
      const previousDetection = await this.loadPreviousDetection();

      if (!previousDetection) {
        console.log('⚠️  No previous detection found, running full update...');
        return await this.initialize();
      }

      const changes = this.compareDetections(previousDetection, currentDetection);

      if (changes.hasChanges) {
        console.log(`📈 Detected changes: ${changes.summary}`);

        // Update CLAUDE.md with new technologies
        for (const newTech of changes.newTechnologies) {
          await this.generator.updateForNewTechnology(
            newTech.name,
            newTech.type
          );
        }

        // Save updated detection results
        await this.saveDetectionResults(currentDetection);

        return {
          success: true,
          changes: changes,
          updated: true
        };
      } else {
        console.log('✨ No new technologies detected');
        return {
          success: true,
          changes: changes,
          updated: false
        };
      }

    } catch (error) {
      console.error(`❌ Update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle project type change (e.g., adding React to existing Node.js project)
   */
  async handleProjectTypeChange(newProjectType) {
    console.log(`🔄 Handling project type change to: ${newProjectType}`);

    try {
      const config = await this.loadConfiguration();

      // Update configuration
      config.overrideProjectType = newProjectType;
      config.lastManualUpdate = new Date().toISOString();
      await this.updateConfiguration(config);

      // Re-generate CLAUDE.md with new project type
      const claudeContent = await this.generator.generateClaudeMd();

      return {
        success: true,
        newProjectType,
        claudeUpdated: true,
        contentLength: claudeContent.length
      };

    } catch (error) {
      console.error(`❌ Project type change failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Interactive setup for user preferences
   */
  async interactiveSetup() {
    console.log('🎯 Starting interactive setup...');

    const prompts = [
      {
        name: 'autoDetect',
        message: 'Enable automatic language detection?',
        type: 'confirm',
        default: true
      },
      {
        name: 'autoGenerate',
        message: 'Auto-generate CLAUDE.md when languages are detected?',
        type: 'confirm',
        default: true
      },
      {
        name: 'backupExisting',
        message: 'Create backups of existing CLAUDE.md files?',
        type: 'confirm',
        default: true
      },
      {
        name: 'watchForChanges',
        message: 'Watch for file changes and update automatically?',
        type: 'confirm',
        default: false
      },
      {
        name: 'includeFrameworkSpecific',
        message: 'Include framework-specific best practices?',
        type: 'confirm',
        default: true
      },
      {
        name: 'includeBestPractices',
        message: 'Include general best practices sections?',
        type: 'confirm',
        default: true
      },
      {
        name: 'includeTestingPatterns',
        message: 'Include testing patterns and examples?',
        type: 'confirm',
        default: true
      }
    ];

    // For now, use defaults (in a real implementation, you'd use inquirer or similar)
    const preferences = {
      autoDetect: true,
      autoGenerate: true,
      backupExisting: true,
      watchForChanges: false,
      includeFrameworkSpecific: true,
      includeBestPractices: true,
      includeTestingPatterns: true,
      setupDate: new Date().toISOString()
    };

    await this.updateConfiguration(preferences);

    console.log('✅ Interactive setup completed');
    console.log('📋 Preferences saved to:', this.configPath);

    return preferences;
  }

  /**
   * Validate project configuration and detect issues
   */
  async validateProject() {
    console.log('🔎 Validating project configuration...');

    const issues = [];
    const suggestions = [];

    try {
      // Check for package.json or similar
      const packageFiles = ['package.json', 'requirements.txt', 'pom.xml', 'Cargo.toml', 'go.mod'];
      let hasPackageFile = false;

      for (const file of packageFiles) {
        try {
          await fs.access(path.join(this.projectPath, file));
          hasPackageFile = true;
          break;
        } catch {}
      }

      if (!hasPackageFile) {
        issues.push({
          type: 'warning',
          message: 'No package management file found',
          suggestion: 'Consider initializing with npm init, pip, or appropriate package manager'
        });
      }

      // Check for Git repository
      try {
        await fs.access(path.join(this.projectPath, '.git'));
      } catch {
        suggestions.push({
          type: 'info',
          message: 'No Git repository detected',
          suggestion: 'Consider initializing with: git init'
        });
      }

      // Check for existing CLAUDE.md
      try {
        await fs.access(path.join(this.projectPath, 'CLAUDE.md'));
      } catch {
        suggestions.push({
          type: 'info',
          message: 'No CLAUDE.md found',
          suggestion: 'Will be generated automatically if auto-generation is enabled'
        });
      }

      // Check directory structure
      const commonDirs = ['src', 'lib', 'app', 'tests', 'test'];
      let hasSourceDir = false;

      for (const dir of commonDirs) {
        try {
          const stat = await fs.stat(path.join(this.projectPath, dir));
          if (stat.isDirectory()) {
            hasSourceDir = true;
            break;
          }
        } catch {}
      }

      if (!hasSourceDir) {
        suggestions.push({
          type: 'info',
          message: 'No standard source directory found',
          suggestion: 'Consider organizing code in src/ or app/ directory'
        });
      }

      const validation = {
        valid: issues.length === 0,
        issues,
        suggestions,
        checkedAt: new Date().toISOString()
      };

      console.log(`✅ Validation complete: ${issues.length} issues, ${suggestions.length} suggestions`);
      return validation;

    } catch (error) {
      console.error(`❌ Validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate project report with recommendations
   */
  async generateProjectReport() {
    console.log('📊 Generating project report...');

    try {
      const [detection, validation, config] = await Promise.all([
        this.detector.detectProject(),
        this.validateProject(),
        this.loadConfiguration()
      ]);

      const report = {
        project: {
          path: this.projectPath,
          name: path.basename(this.projectPath),
          analyzedAt: new Date().toISOString()
        },
        detection: {
          ...detection,
          recommendations: detection.getRecommendations ? detection.getRecommendations() : {}
        },
        validation,
        configuration: config,
        suggestions: this.generateSuggestions(detection, validation),
        nextSteps: this.generateNextSteps(detection, validation, config)
      };

      // Save report
      const reportPath = path.join(this.preferencesPath, 'project-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

      console.log('✅ Project report generated');
      console.log('📄 Report saved to:', reportPath);

      return report;

    } catch (error) {
      console.error(`❌ Report generation failed: ${error.message}`);
      throw error;
    }
  }

  // Private methods

  async ensureDirectoryStructure() {
    const dirs = [
      this.preferencesPath,
      path.join(this.preferencesPath, 'language-configs'),
      path.join(this.preferencesPath, 'backups'),
      path.join(this.preferencesPath, 'reports')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async loadConfiguration() {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Return default configuration
      return {
        autoDetect: true,
        autoGenerate: true,
        backupExisting: true,
        watchForChanges: false,
        includeFrameworkSpecific: true,
        includeBestPractices: true,
        includeTestingPatterns: true,
        createdAt: new Date().toISOString()
      };
    }
  }

  async updateConfiguration(config) {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async shouldGenerateClaudeMd(detectionResults, config) {
    if (!config.autoGenerate) {
      return { generate: false, reason: 'Auto-generation disabled in config' };
    }

    if (detectionResults.confidence < 0.3) {
      return { generate: false, reason: 'Detection confidence too low' };
    }

    if (Object.keys(detectionResults.languages).length === 0) {
      return { generate: false, reason: 'No languages detected' };
    }

    // Check if CLAUDE.md exists and when it was last modified
    try {
      const claudeMdPath = path.join(this.projectPath, 'CLAUDE.md');
      const stat = await fs.stat(claudeMdPath);
      const lastModified = stat.mtime;
      const daysSinceModified = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceModified < 1 && !config.forceRegenerate) {
        return { generate: false, reason: 'CLAUDE.md was recently modified' };
      }
    } catch {
      // File doesn't exist, we should generate it
    }

    return { generate: true, reason: 'Conditions met for generation' };
  }

  async saveDetectionResults(results) {
    const resultsPath = path.join(this.preferencesPath, 'last-detection.json');
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
  }

  async loadPreviousDetection() {
    try {
      const resultsPath = path.join(this.preferencesPath, 'last-detection.json');
      const content = await fs.readFile(resultsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  compareDetections(previous, current) {
    const changes = {
      hasChanges: false,
      newLanguages: [],
      newFrameworks: [],
      newTechnologies: [],
      removedLanguages: [],
      removedFrameworks: [],
      confidenceChanges: {},
      summary: ''
    };

    // Compare languages
    for (const [lang, confidence] of Object.entries(current.languages)) {
      if (!previous.languages[lang]) {
        changes.newLanguages.push({ name: lang, confidence });
        changes.newTechnologies.push({ name: lang, type: 'language' });
        changes.hasChanges = true;
      }
    }

    // Compare frameworks
    for (const [framework, confidence] of Object.entries(current.frameworks)) {
      if (!previous.frameworks[framework]) {
        changes.newFrameworks.push({ name: framework, confidence });
        changes.newTechnologies.push({ name: framework, type: 'framework' });
        changes.hasChanges = true;
      }
    }

    // Check for removed technologies
    for (const lang of Object.keys(previous.languages)) {
      if (!current.languages[lang]) {
        changes.removedLanguages.push(lang);
        changes.hasChanges = true;
      }
    }

    for (const framework of Object.keys(previous.frameworks)) {
      if (!current.frameworks[framework]) {
        changes.removedFrameworks.push(framework);
        changes.hasChanges = true;
      }
    }

    // Generate summary
    const summaryParts = [];
    if (changes.newLanguages.length) summaryParts.push(`${changes.newLanguages.length} new languages`);
    if (changes.newFrameworks.length) summaryParts.push(`${changes.newFrameworks.length} new frameworks`);
    if (changes.removedLanguages.length) summaryParts.push(`${changes.removedLanguages.length} removed languages`);
    if (changes.removedFrameworks.length) summaryParts.push(`${changes.removedFrameworks.length} removed frameworks`);

    changes.summary = summaryParts.join(', ') || 'No significant changes';

    return changes;
  }

  generateSuggestions(detection, validation) {
    const suggestions = [];

    // Language-specific suggestions
    if (detection.languages.javascript && !detection.languages.typescript) {
      suggestions.push({
        type: 'enhancement',
        message: 'Consider migrating to TypeScript for better type safety',
        priority: 'medium'
      });
    }

    if (detection.frameworks.react && !detection.frameworks.nextjs) {
      suggestions.push({
        type: 'enhancement',
        message: 'Consider Next.js for better SEO and performance',
        priority: 'low'
      });
    }

    // Testing suggestions
    const hasTestFramework = Object.keys(detection.dependencies).some(dep =>
      ['jest', 'pytest', 'mocha', 'jasmine', 'vitest'].includes(dep.toLowerCase())
    );

    if (!hasTestFramework) {
      suggestions.push({
        type: 'quality',
        message: 'No testing framework detected - consider adding automated tests',
        priority: 'high'
      });
    }

    return suggestions;
  }

  generateNextSteps(detection, validation, config) {
    const steps = [];

    if (!config.setupCompleted) {
      steps.push('Run interactive setup: npm run claude-flow:setup');
    }

    if (validation.issues.length > 0) {
      steps.push('Address validation issues found in project');
    }

    if (detection.confidence < 0.7) {
      steps.push('Review and verify detected languages/frameworks');
    }

    steps.push('Review generated CLAUDE.md file');
    steps.push('Commit changes to version control');

    return steps;
  }

  async setupFileWatcher() {
    // In a real implementation, this would set up file system watching
    // using something like chokidar to watch for changes to package.json,
    // new files, etc., and trigger re-detection
    console.log('📂 File watching setup completed (placeholder)');
  }

  /**
   * Clean up old backups and reports
   */
  async cleanup(olderThanDays = 30) {
    console.log(`🧹 Cleaning up files older than ${olderThanDays} days...`);

    const backupsDir = path.join(this.preferencesPath, 'backups');
    const reportsDir = path.join(this.preferencesPath, 'reports');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleanedCount = 0;

    for (const dir of [backupsDir, reportsDir]) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);

          if (stat.mtime < cutoffDate) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        }
      } catch (error) {
        // Directory might not exist, continue
        continue;
      }
    }

    console.log(`✅ Cleanup complete: ${cleanedCount} files removed`);
    return { cleanedCount, cutoffDate };
  }
}

export default IntegrationSystem;