# Template Customization and Extension Guide

## Overview

This guide provides comprehensive instructions for customizing and extending the Claude Flow Novice template system. It covers creating custom templates, extending the preference system, adding new language support, and building enterprise-grade customizations.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Creating Custom Templates](#creating-custom-templates)
3. [Extending Language Detection](#extending-language-detection)
4. [Custom Preference Categories](#custom-preference-categories)
5. [Plugin System](#plugin-system)
6. [Enterprise Customizations](#enterprise-customizations)
7. [API Reference](#api-reference)
8. [Migration Guide](#migration-guide)
9. [Testing and Validation](#testing-and-validation)

## Architecture Overview

### Template System Components

```
Template System Architecture:
├── Template Engine
│   ├── Template Generators     # Dynamic content creation
│   ├── Variable Substitution   # Placeholder replacement
│   ├── Conditional Logic       # Context-aware generation
│   └── Output Formatting       # File structure organization
├── Preference System
│   ├── Schema Validation       # Configuration validation
│   ├── Context Adaptation      # Dynamic preference adjustment
│   ├── Inheritance Chain       # Default → Global → Project
│   └── Suggestion Engine       # Intelligent recommendations
├── Language Detection
│   ├── File Analyzers         # Project structure analysis
│   ├── Dependency Scanners    # Package.json, requirements.txt
│   ├── Framework Detectors    # React, Django, Express, etc.
│   └── Build Tool Recognition  # Webpack, Vite, Maven, etc.
└── Extension Points
    ├── Custom Templates        # User-defined templates
    ├── Plugin Hooks           # Lifecycle integration
    ├── Custom Validators       # Preference validation
    └── External Integrations   # Third-party tool support
```

### Extension Mechanisms

1. **Template Generators**: Create dynamic content based on context
2. **Preference Schemas**: Define new configuration categories
3. **Language Detectors**: Add support for new languages/frameworks
4. **Plugin Hooks**: Integrate with external tools and workflows
5. **Custom Validators**: Implement business-specific validation rules

## Creating Custom Templates

### Basic Custom Template

#### 1. Define Template Structure
```javascript
// src/templates/custom/my-template.js

export class MyCustomTemplate {
  constructor(options = {}) {
    this.options = options;
    this.templateName = 'my-custom-template';
    this.version = '1.0.0';
  }

  // Template metadata
  getMetadata() {
    return {
      name: this.templateName,
      version: this.version,
      description: 'Custom template for specialized project setup',
      author: 'Your Name',
      tags: ['custom', 'specialized'],
      supportedLanguages: ['javascript', 'typescript'],
      supportedFrameworks: ['react', 'vue', 'svelte'],
      requirements: {
        nodeVersion: '>=16.0.0',
        npmVersion: '>=8.0.0'
      }
    };
  }

  // Generate template content
  async generate(context) {
    const { language, framework, preferences, projectInfo } = context;

    return {
      files: await this.generateFiles(context),
      directories: await this.generateDirectories(context),
      commands: await this.generateCommands(context),
      instructions: await this.generateInstructions(context)
    };
  }

  // Generate file contents
  async generateFiles(context) {
    const files = new Map();

    // Main configuration file
    files.set('CLAUDE.md', await this.generateClaudeMd(context));

    // Custom workflow file
    files.set('.claude/workflows/custom-workflow.md', await this.generateWorkflow(context));

    // Project-specific configuration
    files.set('.custom-config.json', await this.generateConfig(context));

    return files;
  }

  // Generate CLAUDE.md with custom patterns
  async generateClaudeMd(context) {
    const { language, framework, preferences } = context;

    return `# Claude Code Configuration - ${this.getProjectTitle(context)}

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently

### Custom Project Configuration

**Project Type**: ${this.getProjectType(context)}
**Technology Stack**: ${this.getTechStack(context)}
**Development Mode**: ${this.getDevelopmentMode(context)}

### Custom Agent Workflow Patterns

\`\`\`javascript
// ✅ CORRECT: Custom project development workflow
[Single Message]:
  ${this.generateAgentTasks(context)}

  // Custom project todos
  TodoWrite({ todos: [
    ${this.generateCustomTodos(context)}
  ]})
\`\`\`

### Custom Development Patterns

${await this.generateDevelopmentPatterns(context)}

### Custom Build Commands

\`\`\`bash
${this.generateBuildCommands(context)}
\`\`\`

${await this.generateAdditionalSections(context)}
`;
  }

  // Helper methods for content generation
  getProjectTitle(context) {
    const { framework, language } = context;
    return `${framework ? framework.charAt(0).toUpperCase() + framework.slice(1) : language.charAt(0).toUpperCase() + language.slice(1)} Custom Project`;
  }

  getProjectType(context) {
    // Custom logic to determine project type
    if (context.framework === 'react') return 'Single Page Application';
    if (context.framework === 'express') return 'REST API Server';
    return 'Custom Application';
  }

  getTechStack(context) {
    const { language, framework, projectInfo } = context;
    const stack = [language];

    if (framework) stack.push(framework);
    if (projectInfo.buildTool) stack.push(projectInfo.buildTool);
    if (projectInfo.packageManager) stack.push(projectInfo.packageManager);

    return stack.join(', ');
  }

  getDevelopmentMode(context) {
    const { preferences } = context;
    return preferences.experience?.level === 'beginner' ? 'Learning Mode' : 'Production Mode';
  }

  generateAgentTasks(context) {
    const { preferences } = context;
    const concurrency = preferences.workflow?.concurrency || 2;

    const tasks = [
      'Task("Project Analyzer", "Analyze custom project requirements and constraints", "researcher")',
      'Task("Custom Developer", "Implement specialized features and patterns", "coder")',
      'Task("Quality Reviewer", "Review code quality and adherence to custom standards", "reviewer")'
    ];

    if (concurrency > 3) {
      tasks.push('Task("Performance Optimizer", "Optimize for custom performance requirements", "performance-analyzer")');
    }

    if (preferences.workflow?.testRunning !== 'never') {
      tasks.push('Task("Test Engineer", "Create comprehensive test suite", "tester")');
    }

    return tasks.join('\n  ');
  }

  generateCustomTodos(context) {
    const todos = [
      '{content: "Analyze custom requirements", status: "in_progress", activeForm: "Analyzing custom requirements"}',
      '{content: "Implement core functionality", status: "pending", activeForm: "Implementing core functionality"}',
      '{content: "Add custom integrations", status: "pending", activeForm: "Adding custom integrations"}',
      '{content: "Optimize performance", status: "pending", activeForm: "Optimizing performance"}',
      '{content: "Write documentation", status: "pending", activeForm: "Writing documentation"}'
    ];

    return todos.join(',\n    ');
  }

  async generateDevelopmentPatterns(context) {
    const { language, framework } = context;

    // Load language-specific patterns
    const patterns = await this.loadDevelopmentPatterns(language, framework);

    return patterns || `### ${language.charAt(0).toUpperCase() + language.slice(1)} Development Patterns

**Custom Patterns for ${framework || language}:**
- Follow established conventions
- Implement error handling
- Use modern syntax and features
- Maintain code quality standards`;
  }

  generateBuildCommands(context) {
    const { projectInfo } = context;
    const pm = projectInfo.packageManager || 'npm';

    return `# Development
${pm} install
${pm} run dev

# Testing
${pm} test
${pm} run test:coverage

# Production Build
${pm} run build
${pm} run preview

# Custom Commands
${pm} run custom:deploy
${pm} run custom:analyze`;
  }

  async generateAdditionalSections(context) {
    return `### Custom Integration Points

**Available Integrations:**
- Custom CI/CD pipelines
- Specialized testing frameworks
- Performance monitoring
- Custom deployment strategies

### Support and Documentation

**Resources:**
- Custom documentation: ./docs/
- API reference: ./docs/api/
- Examples: ./examples/
- Troubleshooting: ./docs/troubleshooting.md`;
  }

  // Load external pattern files
  async loadDevelopmentPatterns(language, framework) {
    try {
      const patternPath = `./patterns/${language}/${framework || 'default'}.md`;
      const fs = await import('fs/promises');
      return await fs.readFile(patternPath, 'utf8');
    } catch (error) {
      return null;
    }
  }

  // Generate directory structure
  async generateDirectories(context) {
    const directories = [
      'src',
      'tests',
      'docs',
      'config',
      'scripts',
      '.claude/custom',
      'memory/custom',
      'coordination/custom'
    ];

    // Add language-specific directories
    if (context.language === 'javascript' || context.language === 'typescript') {
      directories.push('src/components', 'src/utils', 'src/services');
    }

    if (context.framework === 'react') {
      directories.push('src/hooks', 'src/contexts', 'public');
    }

    return directories;
  }

  // Generate setup commands
  async generateCommands(context) {
    const { projectInfo } = context;
    const pm = projectInfo.packageManager || 'npm';

    return [
      `${pm} install`,
      'claude-flow-novice init --custom',
      'claude-flow-novice preferences setup',
      `${pm} run dev`
    ];
  }

  // Generate post-setup instructions
  async generateInstructions(context) {
    return [
      'Run the setup wizard to configure preferences',
      'Review generated files and customize as needed',
      'Start development server to verify setup',
      'Consult documentation for advanced features'
    ];
  }

  // Validation logic
  validate(context) {
    const errors = [];

    if (!context.language) {
      errors.push('Language must be specified');
    }

    if (!context.projectInfo) {
      errors.push('Project information is required');
    }

    if (context.framework && !this.getMetadata().supportedFrameworks.includes(context.framework)) {
      errors.push(`Framework ${context.framework} is not supported`);
    }

    return errors;
  }
}

// Export template instance
export default MyCustomTemplate;
```

#### 2. Register Custom Template
```javascript
// src/templates/template-registry.js

import MyCustomTemplate from './custom/my-template.js';

export class TemplateRegistry {
  constructor() {
    this.templates = new Map();
    this.registerBuiltinTemplates();
  }

  registerBuiltinTemplates() {
    // Register built-in templates
    this.register('enhanced', () => import('./enhanced-templates.js'));
    this.register('minimal', () => import('./minimal-templates.js'));
    this.register('optimized', () => import('./optimized-templates.js'));
  }

  // Register custom template
  register(name, templateFactory) {
    this.templates.set(name, templateFactory);
  }

  // Register the custom template
  registerCustomTemplates() {
    this.register('my-custom', () => new MyCustomTemplate());
  }

  async getTemplate(name) {
    const factory = this.templates.get(name);
    if (!factory) {
      throw new Error(`Template '${name}' not found`);
    }

    return typeof factory === 'function' ? await factory() : factory;
  }

  listTemplates() {
    return Array.from(this.templates.keys());
  }

  async getTemplateMetadata(name) {
    const template = await this.getTemplate(name);
    return template.getMetadata ? template.getMetadata() : null;
  }
}

// Usage in CLI
export async function initWithCustomTemplate(templateName, options) {
  const registry = new TemplateRegistry();
  registry.registerCustomTemplates();

  const template = await registry.getTemplate(templateName);
  const context = await buildContext(options);

  return await template.generate(context);
}
```

### Advanced Template Features

#### Conditional Content Generation
```javascript
// Advanced template with conditional content
export class ConditionalTemplate {
  async generateFiles(context) {
    const files = new Map();
    const { preferences, projectInfo } = context;

    // Base files
    files.set('CLAUDE.md', await this.generateClaudeMd(context));

    // Conditional files based on preferences
    if (preferences.advanced?.memoryPersistence) {
      files.set('.claude/memory-config.json', await this.generateMemoryConfig(context));
    }

    if (preferences.advanced?.hookIntegration) {
      files.set('.claude/hooks/custom-hooks.js', await this.generateCustomHooks(context));
    }

    // Framework-specific files
    if (projectInfo.framework === 'react') {
      files.set('src/App.tsx', await this.generateReactApp(context));
      files.set('src/components/index.ts', await this.generateComponentIndex(context));
    }

    if (projectInfo.framework === 'express') {
      files.set('src/server.js', await this.generateExpressServer(context));
      files.set('src/routes/index.js', await this.generateRoutes(context));
    }

    // Testing files if enabled
    if (preferences.workflow?.testRunning !== 'never') {
      files.set('tests/setup.js', await this.generateTestSetup(context));
      files.set('tests/utils.js', await this.generateTestUtils(context));
    }

    return files;
  }

  // Generate memory configuration
  async generateMemoryConfig(context) {
    return JSON.stringify({
      persistence: {
        enabled: true,
        storage: 'file',
        compression: true,
        ttl: 86400000 // 24 hours
      },
      caching: {
        enabled: true,
        maxSize: 100,
        strategy: 'lru'
      },
      synchronization: {
        enabled: context.preferences.workflow?.concurrency > 1,
        interval: 5000
      }
    }, null, 2);
  }

  // Generate custom hooks
  async generateCustomHooks(context) {
    return `// Custom hooks for ${context.projectInfo.framework || context.language} projects

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Pre-task hook
async function preTask(taskInfo) {
  console.log(\`Starting task: \${taskInfo.description}\`);

  // Log task start
  const logEntry = {
    task: taskInfo.description,
    timestamp: new Date().toISOString(),
    type: 'start'
  };

  await logToFile(logEntry);
}

// Post-task hook
async function postTask(taskInfo, result) {
  console.log(\`Completed task: \${taskInfo.description}\`);

  // Log task completion
  const logEntry = {
    task: taskInfo.description,
    timestamp: new Date().toISOString(),
    type: 'complete',
    success: result.success,
    duration: result.duration
  };

  await logToFile(logEntry);

  // Custom post-processing
  if (result.files) {
    await processGeneratedFiles(result.files);
  }
}

// File logging utility
async function logToFile(entry) {
  const logPath = path.join(process.cwd(), '.claude', 'logs', 'custom-hooks.log');
  const logLine = JSON.stringify(entry) + '\\n';

  await fs.promises.appendFile(logPath, logLine, 'utf8');
}

// Process generated files
async function processGeneratedFiles(files) {
  for (const file of files) {
    // Add custom processing logic
    console.log(\`Processed: \${file}\`);
  }
}

module.exports = {
  preTask,
  postTask
};`;
  }
}
```

#### Multi-Language Template Support
```javascript
// Template with multi-language support
export class MultiLanguageTemplate {
  constructor() {
    this.supportedLanguages = ['javascript', 'typescript', 'python', 'rust', 'go'];
  }

  async generate(context) {
    const { language } = context;

    // Dispatch to language-specific generator
    switch (language) {
      case 'javascript':
      case 'typescript':
        return this.generateJSProject(context);
      case 'python':
        return this.generatePythonProject(context);
      case 'rust':
        return this.generateRustProject(context);
      case 'go':
        return this.generateGoProject(context);
      default:
        return this.generateGenericProject(context);
    }
  }

  async generateJSProject(context) {
    const files = new Map();

    files.set('CLAUDE.md', await this.generateJSClaudeMd(context));
    files.set('package.json', await this.generatePackageJson(context));
    files.set('.eslintrc.js', await this.generateESLintConfig(context));

    if (context.language === 'typescript') {
      files.set('tsconfig.json', await this.generateTSConfig(context));
    }

    return { files, directories: this.getJSDirectories(context) };
  }

  async generatePythonProject(context) {
    const files = new Map();

    files.set('CLAUDE.md', await this.generatePythonClaudeMd(context));
    files.set('requirements.txt', await this.generateRequirements(context));
    files.set('setup.py', await this.generateSetupPy(context));
    files.set('.flake8', await this.generateFlake8Config(context));

    return { files, directories: this.getPythonDirectories(context) };
  }

  // Language-specific content generation methods...
}
```

## Extending Language Detection

### Adding New Language Support

#### 1. Create Language Detector
```javascript
// src/detection/languages/kotlin-detector.js

export class KotlinDetector {
  constructor() {
    this.language = 'kotlin';
    this.extensions = ['.kt', '.kts'];
    this.configFiles = ['build.gradle.kts', 'settings.gradle.kts'];
    this.keywords = ['fun', 'val', 'var', 'class', 'object'];
  }

  async detect(projectPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // Check for Kotlin-specific files
      const hasGradleKotlin = await this.hasFile(projectPath, 'build.gradle.kts');
      const hasKotlinFiles = await this.hasKotlinFiles(projectPath);
      const hasAndroidManifest = await this.hasFile(projectPath, 'src/main/AndroidManifest.xml');

      if (hasGradleKotlin || hasKotlinFiles) {
        return {
          detected: true,
          confidence: this.calculateConfidence(hasGradleKotlin, hasKotlinFiles, hasAndroidManifest),
          language: this.language,
          framework: hasAndroidManifest ? 'android' : null,
          buildTool: hasGradleKotlin ? 'gradle' : null,
          metadata: {
            projectType: hasAndroidManifest ? 'android-app' : 'kotlin-jvm',
            hasTests: await this.hasTestFiles(projectPath),
            dependencies: await this.analyzeDependencies(projectPath)
          }
        };
      }

      return { detected: false };
    } catch (error) {
      return { detected: false, error: error.message };
    }
  }

  async hasFile(projectPath, fileName) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      await fs.access(path.join(projectPath, fileName));
      return true;
    } catch {
      return false;
    }
  }

  async hasKotlinFiles(projectPath) {
    const glob = await import('glob');
    const kotlinFiles = await glob.glob('**/*.kt', { cwd: projectPath });
    return kotlinFiles.length > 0;
  }

  async hasTestFiles(projectPath) {
    const glob = await import('glob');
    const testFiles = await glob.glob('**/test/**/*.kt', { cwd: projectPath });
    return testFiles.length > 0;
  }

  async analyzeDependencies(projectPath) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const buildFile = path.join(projectPath, 'build.gradle.kts');
      const content = await fs.readFile(buildFile, 'utf8');

      const dependencies = [];
      const lines = content.split('\n');

      for (const line of lines) {
        if (line.includes('implementation') || line.includes('api')) {
          const match = line.match(/"([^"]+)"/);
          if (match) {
            dependencies.push(match[1]);
          }
        }
      }

      return dependencies;
    } catch {
      return [];
    }
  }

  calculateConfidence(hasGradleKotlin, hasKotlinFiles, hasAndroidManifest) {
    let confidence = 0;

    if (hasGradleKotlin) confidence += 40;
    if (hasKotlinFiles) confidence += 30;
    if (hasAndroidManifest) confidence += 20;

    return Math.min(confidence, 90);
  }

  // Framework detection
  detectFrameworks(dependencies) {
    const frameworks = [];

    if (dependencies.some(dep => dep.includes('ktor'))) {
      frameworks.push('ktor');
    }

    if (dependencies.some(dep => dep.includes('spring'))) {
      frameworks.push('spring-boot');
    }

    if (dependencies.some(dep => dep.includes('android'))) {
      frameworks.push('android');
    }

    return frameworks;
  }
}
```

#### 2. Register Language Detector
```javascript
// src/detection/detector-registry.js

import { KotlinDetector } from './languages/kotlin-detector.js';

export class DetectorRegistry {
  constructor() {
    this.detectors = new Map();
    this.registerBuiltinDetectors();
  }

  registerBuiltinDetectors() {
    this.register('javascript', () => import('./languages/javascript-detector.js'));
    this.register('python', () => import('./languages/python-detector.js'));
    this.register('rust', () => import('./languages/rust-detector.js'));
  }

  register(language, detectorFactory) {
    this.detectors.set(language, detectorFactory);
  }

  // Register Kotlin detector
  registerKotlinDetector() {
    this.register('kotlin', () => new KotlinDetector());
  }

  async detectLanguage(projectPath) {
    const results = [];

    for (const [language, factory] of this.detectors) {
      try {
        const detector = typeof factory === 'function' ? await factory() : factory;
        const result = await detector.detect(projectPath);

        if (result.detected) {
          results.push({ language, ...result });
        }
      } catch (error) {
        console.warn(`Failed to run ${language} detector:`, error.message);
      }
    }

    // Sort by confidence and return best match
    return results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null;
  }
}
```

### Framework Detection Extensions

#### Adding Framework Support
```javascript
// src/detection/frameworks/nestjs-detector.js

export class NestJSDetector {
  constructor() {
    this.framework = 'nestjs';
    this.requiredDependencies = ['@nestjs/core', '@nestjs/common'];
    this.optionalDependencies = ['@nestjs/platform-express', '@nestjs/swagger'];
  }

  async detect(packageJson, projectPath) {
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // Check for required NestJS dependencies
    const hasRequired = this.requiredDependencies.every(dep => dependencies[dep]);

    if (!hasRequired) {
      return { detected: false };
    }

    // Analyze project structure
    const structure = await this.analyzeStructure(projectPath);

    return {
      detected: true,
      confidence: this.calculateConfidence(dependencies, structure),
      framework: this.framework,
      version: dependencies['@nestjs/core'],
      features: this.detectFeatures(dependencies, structure),
      recommendations: this.generateRecommendations(dependencies, structure)
    };
  }

  async analyzeStructure(projectPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const structure = {
      hasMainTs: false,
      hasAppModule: false,
      hasControllers: false,
      hasServices: false,
      hasGuards: false,
      hasInterceptors: false
    };

    try {
      // Check for main.ts
      structure.hasMainTs = await this.fileExists(path.join(projectPath, 'src/main.ts'));

      // Check for app.module.ts
      structure.hasAppModule = await this.fileExists(path.join(projectPath, 'src/app.module.ts'));

      // Check for common patterns
      structure.hasControllers = await this.hasFilesMatching(projectPath, '**/*.controller.ts');
      structure.hasServices = await this.hasFilesMatching(projectPath, '**/*.service.ts');
      structure.hasGuards = await this.hasFilesMatching(projectPath, '**/*.guard.ts');
      structure.hasInterceptors = await this.hasFilesMatching(projectPath, '**/*.interceptor.ts');

    } catch (error) {
      console.warn('Failed to analyze NestJS structure:', error.message);
    }

    return structure;
  }

  detectFeatures(dependencies, structure) {
    const features = [];

    // Database integrations
    if (dependencies['@nestjs/typeorm']) features.push('typeorm');
    if (dependencies['@nestjs/mongoose']) features.push('mongoose');
    if (dependencies['@prisma/client']) features.push('prisma');

    // Authentication
    if (dependencies['@nestjs/passport']) features.push('passport-auth');
    if (dependencies['@nestjs/jwt']) features.push('jwt-auth');

    // API documentation
    if (dependencies['@nestjs/swagger']) features.push('swagger');

    // Testing
    if (dependencies['@nestjs/testing']) features.push('testing');

    // GraphQL
    if (dependencies['@nestjs/graphql']) features.push('graphql');

    // Microservices
    if (dependencies['@nestjs/microservices']) features.push('microservices');

    return features;
  }

  generateRecommendations(dependencies, structure) {
    const recommendations = [];

    if (!structure.hasControllers) {
      recommendations.push({
        type: 'structure',
        message: 'Consider adding controllers for API endpoints',
        priority: 'medium'
      });
    }

    if (!dependencies['@nestjs/swagger']) {
      recommendations.push({
        type: 'documentation',
        message: 'Add @nestjs/swagger for API documentation',
        priority: 'low'
      });
    }

    if (!dependencies['@nestjs/testing']) {
      recommendations.push({
        type: 'testing',
        message: 'Add @nestjs/testing for unit testing support',
        priority: 'high'
      });
    }

    return recommendations;
  }

  calculateConfidence(dependencies, structure) {
    let confidence = 50; // Base confidence for having required deps

    if (structure.hasMainTs) confidence += 20;
    if (structure.hasAppModule) confidence += 15;
    if (structure.hasControllers) confidence += 10;
    if (structure.hasServices) confidence += 5;

    return Math.min(confidence, 95);
  }

  async fileExists(filePath) {
    try {
      const fs = await import('fs/promises');
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async hasFilesMatching(projectPath, pattern) {
    try {
      const glob = await import('glob');
      const files = await glob.glob(pattern, { cwd: projectPath });
      return files.length > 0;
    } catch {
      return false;
    }
  }
}
```

## Custom Preference Categories

### Adding New Preference Schema

#### 1. Extend Preference Schema
```javascript
// src/preferences/schemas/custom-schema.js

export class CustomPreferenceSchema {
  getCustomCategories() {
    return {
      deployment: {
        platform: {
          type: 'enum',
          values: ['vercel', 'netlify', 'aws', 'azure', 'gcp', 'docker'],
          default: 'vercel',
          description: 'Preferred deployment platform'
        },
        environment: {
          type: 'enum',
          values: ['development', 'staging', 'production'],
          default: 'development',
          description: 'Current deployment environment'
        },
        autoDeployment: {
          type: 'boolean',
          default: false,
          description: 'Enable automatic deployment on push'
        },
        branch: {
          type: 'string',
          default: 'main',
          description: 'Branch to deploy from'
        }
      },

      monitoring: {
        analytics: {
          type: 'enum',
          values: ['none', 'google-analytics', 'mixpanel', 'amplitude'],
          default: 'none',
          description: 'Analytics platform'
        },
        errorTracking: {
          type: 'enum',
          values: ['none', 'sentry', 'bugsnag', 'rollbar'],
          default: 'none',
          description: 'Error tracking service'
        },
        performance: {
          type: 'boolean',
          default: false,
          description: 'Enable performance monitoring'
        },
        logging: {
          level: {
            type: 'enum',
            values: ['debug', 'info', 'warn', 'error'],
            default: 'info',
            description: 'Logging level'
          },
          destination: {
            type: 'enum',
            values: ['console', 'file', 'service'],
            default: 'console',
            description: 'Log destination'
          }
        }
      },

      security: {
        authentication: {
          provider: {
            type: 'enum',
            values: ['none', 'auth0', 'firebase', 'cognito', 'custom'],
            default: 'none',
            description: 'Authentication provider'
          },
          mfa: {
            type: 'boolean',
            default: false,
            description: 'Enable multi-factor authentication'
          }
        },
        authorization: {
          rbac: {
            type: 'boolean',
            default: false,
            description: 'Enable role-based access control'
          },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            default: ['read', 'write'],
            description: 'Available permissions'
          }
        },
        encryption: {
          atRest: {
            type: 'boolean',
            default: false,
            description: 'Enable encryption at rest'
          },
          inTransit: {
            type: 'boolean',
            default: true,
            description: 'Enable encryption in transit'
          }
        }
      },

      performance: {
        caching: {
          strategy: {
            type: 'enum',
            values: ['none', 'memory', 'redis', 'cdn'],
            default: 'memory',
            description: 'Caching strategy'
          },
          ttl: {
            type: 'integer',
            min: 0,
            max: 86400,
            default: 3600,
            description: 'Cache TTL in seconds'
          }
        },
        optimization: {
          bundleSplitting: {
            type: 'boolean',
            default: true,
            description: 'Enable bundle splitting'
          },
          treeshaking: {
            type: 'boolean',
            default: true,
            description: 'Enable tree shaking'
          },
          minification: {
            type: 'boolean',
            default: true,
            description: 'Enable code minification'
          }
        }
      }
    };
  }

  // Validation for custom categories
  validateCustomPreferences(preferences) {
    const errors = [];
    const customSchema = this.getCustomCategories();

    for (const [category, schema] of Object.entries(customSchema)) {
      if (preferences[category]) {
        const categoryErrors = this.validateCategory(preferences[category], schema, category);
        errors.push(...categoryErrors);
      }
    }

    return errors;
  }

  validateCategory(values, schema, categoryName) {
    const errors = [];

    for (const [key, spec] of Object.entries(schema)) {
      if (values[key] !== undefined) {
        const validation = this.validateField(values[key], spec, `${categoryName}.${key}`);
        if (!validation.valid) {
          errors.push(validation.error);
        }
      }
    }

    return errors;
  }

  validateField(value, spec, fieldPath) {
    if (spec.type === 'enum' && !spec.values.includes(value)) {
      return {
        valid: false,
        error: `Invalid value for ${fieldPath}. Must be one of: ${spec.values.join(', ')}`
      };
    }

    if (spec.type === 'integer') {
      const numValue = parseInt(value);
      if (isNaN(numValue)) {
        return {
          valid: false,
          error: `${fieldPath} must be a number`
        };
      }
      if (spec.min !== undefined && numValue < spec.min) {
        return {
          valid: false,
          error: `${fieldPath} must be at least ${spec.min}`
        };
      }
      if (spec.max !== undefined && numValue > spec.max) {
        return {
          valid: false,
          error: `${fieldPath} must be at most ${spec.max}`
        };
      }
    }

    if (spec.type === 'boolean' && typeof value !== 'boolean') {
      return {
        valid: false,
        error: `${fieldPath} must be a boolean`
      };
    }

    return { valid: true };
  }

  // Generate contextual suggestions for custom preferences
  generateCustomSuggestions(preferences, context) {
    const suggestions = [];

    // Deployment suggestions
    if (preferences.project?.framework === 'react' && !preferences.deployment?.platform) {
      suggestions.push({
        type: 'enhancement',
        key: 'deployment.platform',
        value: 'vercel',
        reason: 'Vercel is optimized for React applications',
        impact: 'medium'
      });
    }

    // Monitoring suggestions for production
    if (preferences.deployment?.environment === 'production' && !preferences.monitoring?.errorTracking) {
      suggestions.push({
        type: 'enhancement',
        key: 'monitoring.errorTracking',
        value: 'sentry',
        reason: 'Error tracking is essential for production applications',
        impact: 'high'
      });
    }

    // Security suggestions
    if (preferences.project?.type === 'api' && !preferences.security?.authentication?.provider) {
      suggestions.push({
        type: 'security',
        key: 'security.authentication.provider',
        value: 'auth0',
        reason: 'APIs should implement authentication',
        impact: 'high'
      });
    }

    return suggestions;
  }
}
```

#### 2. Integrate Custom Schema
```javascript
// src/preferences/preference-manager.js (extended)

import { CustomPreferenceSchema } from './schemas/custom-schema.js';

export class ExtendedPreferenceManager extends PreferenceManager {
  constructor() {
    super();
    this.customSchema = new CustomPreferenceSchema();
  }

  // Override schema to include custom categories
  getExtendedDefaults() {
    const baseDefaults = this.schema.getDefaults();
    const customDefaults = this.extractDefaults(this.customSchema.getCustomCategories());

    return { ...baseDefaults, ...customDefaults };
  }

  // Override validation to include custom validation
  validateExtended(preferences) {
    const baseErrors = this.schema.validate(preferences);
    const customErrors = this.customSchema.validateCustomPreferences(preferences);

    return [...baseErrors, ...customErrors];
  }

  // Enhanced suggestions including custom categories
  async generateEnhancedSuggestions(context = {}) {
    const baseSuggestions = await this.generateSuggestions();
    const customSuggestions = this.customSchema.generateCustomSuggestions(
      await this.loadPreferences(),
      context
    );

    return [...baseSuggestions, ...customSuggestions];
  }

  // Extract default values from schema
  extractDefaults(schema) {
    const defaults = {};

    for (const [category, fields] of Object.entries(schema)) {
      defaults[category] = {};

      for (const [field, spec] of Object.entries(fields)) {
        if (spec.default !== undefined) {
          defaults[category][field] = spec.default;
        } else if (spec.type === 'object' && spec.properties) {
          defaults[category][field] = this.extractDefaults({ [field]: spec.properties })[field];
        }
      }
    }

    return defaults;
  }
}
```

## Plugin System

### Creating Plugins

#### 1. Plugin Interface
```javascript
// src/plugins/plugin-interface.js

export class PluginInterface {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.hooks = new Map();
  }

  // Plugin metadata
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      description: this.description || '',
      author: this.author || '',
      license: this.license || 'MIT',
      dependencies: this.dependencies || [],
      hooks: Array.from(this.hooks.keys())
    };
  }

  // Register hook handlers
  registerHook(hookName, handler) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push(handler);
  }

  // Execute hooks
  async executeHook(hookName, context) {
    const handlers = this.hooks.get(hookName) || [];
    const results = [];

    for (const handler of handlers) {
      try {
        const result = await handler(context);
        results.push(result);
      } catch (error) {
        console.error(`Hook ${hookName} failed in plugin ${this.name}:`, error);
        results.push({ error: error.message });
      }
    }

    return results;
  }

  // Lifecycle methods
  async initialize(config) {
    // Override in subclasses
  }

  async activate() {
    // Override in subclasses
  }

  async deactivate() {
    // Override in subclasses
  }

  async cleanup() {
    // Override in subclasses
  }
}
```

#### 2. Example Plugin Implementation
```javascript
// src/plugins/examples/git-integration-plugin.js

import { PluginInterface } from '../plugin-interface.js';

export class GitIntegrationPlugin extends PluginInterface {
  constructor() {
    super('git-integration', '1.0.0');
    this.description = 'Git workflow integration for automated commits and branching';
    this.author = 'Claude Flow Team';

    this.setupHooks();
  }

  setupHooks() {
    // Pre-task hook
    this.registerHook('pre-task', async (context) => {
      return await this.handlePreTask(context);
    });

    // Post-task hook
    this.registerHook('post-task', async (context) => {
      return await this.handlePostTask(context);
    });

    // File generation hook
    this.registerHook('post-file-generation', async (context) => {
      return await this.handleFileGeneration(context);
    });

    // Template initialization hook
    this.registerHook('post-template-init', async (context) => {
      return await this.handleTemplateInit(context);
    });
  }

  async initialize(config) {
    this.config = {
      autoCommit: config.autoCommit || false,
      branchPrefix: config.branchPrefix || 'feature/',
      commitMessageTemplate: config.commitMessageTemplate || 'feat: {description}',
      ...config
    };

    // Check if git is available
    try {
      const { execSync } = await import('child_process');
      execSync('git --version', { stdio: 'ignore' });
      this.gitAvailable = true;
    } catch {
      this.gitAvailable = false;
      console.warn('Git not available, git integration plugin will be disabled');
    }
  }

  async handlePreTask(context) {
    if (!this.gitAvailable || !this.config.autoCommit) return;

    const { taskInfo } = context;

    // Create feature branch if needed
    if (taskInfo.createBranch) {
      const branchName = `${this.config.branchPrefix}${this.sanitizeBranchName(taskInfo.description)}`;
      await this.createBranch(branchName);
    }

    return {
      success: true,
      action: 'pre-task-git-setup',
      branch: await this.getCurrentBranch()
    };
  }

  async handlePostTask(context) {
    if (!this.gitAvailable || !this.config.autoCommit) return;

    const { taskInfo, result } = context;

    if (result.success && result.files?.length > 0) {
      // Stage generated files
      await this.stageFiles(result.files);

      // Create commit
      const commitMessage = this.generateCommitMessage(taskInfo, result);
      await this.createCommit(commitMessage);

      return {
        success: true,
        action: 'auto-commit',
        commitHash: await this.getLastCommitHash(),
        files: result.files
      };
    }

    return { success: true, action: 'no-commit-needed' };
  }

  async handleFileGeneration(context) {
    const { files, templateName } = context;

    // Track generated files for potential git operations
    if (this.config.trackGeneratedFiles) {
      await this.trackGeneratedFiles(files, templateName);
    }

    return {
      success: true,
      trackedFiles: files.length
    };
  }

  async handleTemplateInit(context) {
    if (!this.gitAvailable) return;

    // Initialize git repository if not exists
    if (!await this.isGitRepository()) {
      await this.initializeRepository();

      // Create initial commit
      await this.stageAllFiles();
      await this.createCommit('Initial commit: Claude Flow Novice template initialization');

      return {
        success: true,
        action: 'git-init',
        initialCommit: await this.getLastCommitHash()
      };
    }

    return { success: true, action: 'git-already-initialized' };
  }

  // Git utility methods
  async createBranch(branchName) {
    const { execSync } = await import('child_process');
    try {
      execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
      console.log(`Created and switched to branch: ${branchName}`);
    } catch (error) {
      console.warn(`Failed to create branch ${branchName}:`, error.message);
    }
  }

  async getCurrentBranch() {
    const { execSync } = await import('child_process');
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  async stageFiles(files) {
    const { execSync } = await import('child_process');
    try {
      for (const file of files) {
        execSync(`git add "${file}"`, { stdio: 'pipe' });
      }
    } catch (error) {
      console.warn('Failed to stage files:', error.message);
    }
  }

  async stageAllFiles() {
    const { execSync } = await import('child_process');
    try {
      execSync('git add .', { stdio: 'pipe' });
    } catch (error) {
      console.warn('Failed to stage all files:', error.message);
    }
  }

  async createCommit(message) {
    const { execSync } = await import('child_process');
    try {
      execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
      console.log(`Created commit: ${message}`);
    } catch (error) {
      console.warn('Failed to create commit:', error.message);
    }
  }

  async getLastCommitHash() {
    const { execSync } = await import('child_process');
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  }

  async isGitRepository() {
    const { execSync } = await import('child_process');
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async initializeRepository() {
    const { execSync } = await import('child_process');
    try {
      execSync('git init', { stdio: 'pipe' });
      console.log('Initialized git repository');
    } catch (error) {
      console.warn('Failed to initialize git repository:', error.message);
    }
  }

  generateCommitMessage(taskInfo, result) {
    const template = this.config.commitMessageTemplate;
    const description = taskInfo.description || 'Generated files';

    return template
      .replace('{description}', description)
      .replace('{files}', result.files?.length || 0)
      .replace('{type}', this.inferCommitType(result));
  }

  inferCommitType(result) {
    if (result.files?.some(f => f.includes('test'))) return 'test';
    if (result.files?.some(f => f.includes('doc'))) return 'docs';
    if (result.files?.some(f => f.includes('config'))) return 'config';
    return 'feat';
  }

  sanitizeBranchName(description) {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
  }

  async trackGeneratedFiles(files, templateName) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const trackingFile = path.join(process.cwd(), '.claude', 'generated-files.json');

    try {
      let tracking = {};
      if (await fs.access(trackingFile).then(() => true).catch(() => false)) {
        tracking = JSON.parse(await fs.readFile(trackingFile, 'utf8'));
      }

      if (!tracking[templateName]) {
        tracking[templateName] = [];
      }

      tracking[templateName].push({
        files,
        timestamp: new Date().toISOString(),
        branch: await this.getCurrentBranch()
      });

      await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2));
    } catch (error) {
      console.warn('Failed to track generated files:', error.message);
    }
  }
}
```

#### 3. Plugin Manager
```javascript
// src/plugins/plugin-manager.js

export class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
    this.config = {};
  }

  async initialize(config) {
    this.config = config;
    await this.loadPlugins();
  }

  // Register a plugin
  async registerPlugin(plugin, config = {}) {
    try {
      await plugin.initialize(config);
      await plugin.activate();

      this.plugins.set(plugin.name, plugin);
      this.registerPluginHooks(plugin);

      console.log(`Plugin ${plugin.name} registered successfully`);
    } catch (error) {
      console.error(`Failed to register plugin ${plugin.name}:`, error);
    }
  }

  // Unregister a plugin
  async unregisterPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      try {
        await plugin.deactivate();
        await plugin.cleanup();

        this.unregisterPluginHooks(plugin);
        this.plugins.delete(pluginName);

        console.log(`Plugin ${pluginName} unregistered successfully`);
      } catch (error) {
        console.error(`Failed to unregister plugin ${pluginName}:`, error);
      }
    }
  }

  // Register plugin hooks
  registerPluginHooks(plugin) {
    for (const hookName of plugin.hooks.keys()) {
      if (!this.hooks.has(hookName)) {
        this.hooks.set(hookName, []);
      }
      this.hooks.get(hookName).push(plugin);
    }
  }

  // Unregister plugin hooks
  unregisterPluginHooks(plugin) {
    for (const hookName of plugin.hooks.keys()) {
      const hooks = this.hooks.get(hookName) || [];
      const index = hooks.indexOf(plugin);
      if (index > -1) {
        hooks.splice(index, 1);
      }
    }
  }

  // Execute hooks
  async executeHooks(hookName, context) {
    const plugins = this.hooks.get(hookName) || [];
    const results = [];

    for (const plugin of plugins) {
      try {
        const result = await plugin.executeHook(hookName, context);
        results.push({
          plugin: plugin.name,
          results: result
        });
      } catch (error) {
        console.error(`Hook ${hookName} failed in plugin ${plugin.name}:`, error);
        results.push({
          plugin: plugin.name,
          error: error.message
        });
      }
    }

    return results;
  }

  // Load plugins from configuration
  async loadPlugins() {
    const pluginConfigs = this.config.plugins || [];

    for (const pluginConfig of pluginConfigs) {
      try {
        const PluginClass = await import(pluginConfig.path);
        const plugin = new PluginClass.default();
        await this.registerPlugin(plugin, pluginConfig.config || {});
      } catch (error) {
        console.error(`Failed to load plugin from ${pluginConfig.path}:`, error);
      }
    }
  }

  // Get plugin information
  getPluginInfo(pluginName) {
    const plugin = this.plugins.get(pluginName);
    return plugin ? plugin.getMetadata() : null;
  }

  // List all plugins
  listPlugins() {
    return Array.from(this.plugins.values()).map(plugin => plugin.getMetadata());
  }

  // Get available hooks
  getAvailableHooks() {
    return Array.from(this.hooks.keys());
  }
}
```

## Enterprise Customizations

### Team Configuration Management

#### 1. Team Settings Schema
```javascript
// src/enterprise/team-configuration.js

export class TeamConfiguration {
  constructor() {
    this.teamSchema = {
      team: {
        name: { type: 'string', required: true },
        id: { type: 'string', required: true },
        size: { type: 'integer', min: 1, max: 100 },
        timezone: { type: 'string', default: 'UTC' },
        workingHours: {
          start: { type: 'string', pattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
          end: { type: 'string', pattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
        }
      },
      standards: {
        codeStyle: {
          type: 'enum',
          values: ['airbnb', 'google', 'standard', 'custom'],
          default: 'airbnb'
        },
        testCoverage: {
          type: 'integer',
          min: 0,
          max: 100,
          default: 80
        },
        reviewRequired: { type: 'boolean', default: true },
        cicdIntegration: { type: 'boolean', default: true },
        documentationRequired: { type: 'boolean', default: true }
      },
      workflow: {
        branchingStrategy: {
          type: 'enum',
          values: ['gitflow', 'github-flow', 'gitlab-flow', 'custom'],
          default: 'github-flow'
        },
        deploymentStrategy: {
          type: 'enum',
          values: ['continuous', 'scheduled', 'manual'],
          default: 'continuous'
        },
        releaseStrategy: {
          type: 'enum',
          values: ['semantic', 'calendar', 'custom'],
          default: 'semantic'
        }
      },
      tools: {
        linter: {
          type: 'enum',
          values: ['eslint', 'tslint', 'jshint', 'custom'],
          default: 'eslint'
        },
        formatter: {
          type: 'enum',
          values: ['prettier', 'beautify', 'custom'],
          default: 'prettier'
        },
        bundler: {
          type: 'enum',
          values: ['webpack', 'vite', 'rollup', 'parcel'],
          default: 'webpack'
        },
        testing: {
          unit: {
            type: 'enum',
            values: ['jest', 'mocha', 'jasmine', 'vitest'],
            default: 'jest'
          },
          integration: {
            type: 'enum',
            values: ['cypress', 'playwright', 'selenium', 'puppeteer'],
            default: 'cypress'
          }
        }
      },
      permissions: {
        roles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              permissions: { type: 'array', items: { type: 'string' } },
              level: { type: 'enum', values: ['read', 'write', 'admin'] }
            }
          }
        },
        defaultRole: { type: 'string', default: 'developer' }
      }
    };
  }

  // Generate team-specific template
  async generateTeamTemplate(teamConfig, baseTemplate) {
    const template = { ...baseTemplate };

    // Apply team standards
    template.files.set('.eslintrc.js', this.generateESLintConfig(teamConfig.standards));
    template.files.set('.prettierrc', this.generatePrettierConfig(teamConfig.standards));
    template.files.set('jest.config.js', this.generateJestConfig(teamConfig.tools.testing));

    // Add team workflow files
    template.files.set('.github/workflows/team-ci.yml', this.generateCIConfig(teamConfig));
    template.files.set('.github/PULL_REQUEST_TEMPLATE.md', this.generatePRTemplate(teamConfig));
    template.files.set('CONTRIBUTING.md', this.generateContributingGuide(teamConfig));

    // Team-specific CLAUDE.md sections
    const claudeContent = template.files.get('CLAUDE.md');
    const enhancedClaude = this.enhanceClaudeWithTeamStandards(claudeContent, teamConfig);
    template.files.set('CLAUDE.md', enhancedClaude);

    return template;
  }

  generateESLintConfig(standards) {
    const config = {
      extends: [standards.codeStyle === 'airbnb' ? 'airbnb-base' : standards.codeStyle],
      env: {
        node: true,
        es2021: true,
        jest: true
      },
      rules: {
        // Team-specific rules based on standards
        'max-len': ['error', { code: 100 }],
        'no-console': standards.codeStyle === 'strict' ? 'error' : 'warn'
      }
    };

    return `module.exports = ${JSON.stringify(config, null, 2)};`;
  }

  generatePrettierConfig(standards) {
    return JSON.stringify({
      semi: true,
      singleQuote: standards.codeStyle === 'airbnb',
      tabWidth: 2,
      trailingComma: 'es5',
      printWidth: 100
    }, null, 2);
  }

  generateJestConfig(testingConfig) {
    return `module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{js,ts}'
  ],
  coverageThreshold: {
    global: {
      branches: ${testingConfig.coverageThreshold || 80},
      functions: ${testingConfig.coverageThreshold || 80},
      lines: ${testingConfig.coverageThreshold || 80},
      statements: ${testingConfig.coverageThreshold || 80}
    }
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.js']
};`;
  }

  generateCIConfig(teamConfig) {
    return `name: Team CI Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [16.x, 18.x]

    steps:
    - uses: actions/checkout@v3

    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run linting
      run: npm run lint

    - name: Run tests
      run: npm run test:coverage

    - name: Upload coverage
      uses: codecov/codecov-action@v3

    ${teamConfig.workflow.deploymentStrategy === 'continuous' ? `
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v3
    - name: Deploy to production
      run: npm run deploy
    ` : ''}`;
  }

  generatePRTemplate(teamConfig) {
    return `## Description
Brief description of the changes in this PR.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
${teamConfig.standards.testCoverage ? `- [ ] Code coverage is at least ${teamConfig.standards.testCoverage}%` : ''}

## Code Quality
- [ ] Code follows team style guidelines
${teamConfig.standards.reviewRequired ? '- [ ] Code has been reviewed by team member' : ''}
${teamConfig.standards.documentationRequired ? '- [ ] Documentation has been updated' : ''}

## Checklist
- [ ] My code follows the team's coding standards
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged and published`;
  }

  generateContributingGuide(teamConfig) {
    return `# Contributing to ${teamConfig.team.name} Projects

## Development Workflow

### Branch Strategy: ${teamConfig.workflow.branchingStrategy}

${this.getBranchingStrategyGuide(teamConfig.workflow.branchingStrategy)}

### Code Standards

- **Style Guide**: ${teamConfig.standards.codeStyle}
- **Test Coverage**: Minimum ${teamConfig.standards.testCoverage}%
- **Code Review**: ${teamConfig.standards.reviewRequired ? 'Required' : 'Optional'}
- **Documentation**: ${teamConfig.standards.documentationRequired ? 'Required for all features' : 'Optional'}

### Development Setup

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Run setup wizard: \`claude-flow-novice preferences setup\`
4. Start development: \`npm run dev\`

### Pull Request Process

1. Create feature branch from \`${teamConfig.workflow.branchingStrategy === 'gitflow' ? 'develop' : 'main'}\`
2. Make your changes
3. Run tests: \`npm test\`
4. Run linting: \`npm run lint\`
5. Create pull request
${teamConfig.standards.reviewRequired ? '6. Request team review' : ''}
7. Merge after approval

### Team Working Hours

**Timezone**: ${teamConfig.team.timezone}
**Hours**: ${teamConfig.team.workingHours?.start || '09:00'} - ${teamConfig.team.workingHours?.end || '17:00'}

For urgent issues outside working hours, contact team lead.

### Tools and Setup

- **Linter**: ${teamConfig.tools.linter}
- **Formatter**: ${teamConfig.tools.formatter}
- **Bundler**: ${teamConfig.tools.bundler}
- **Testing**: ${teamConfig.tools.testing.unit} (unit), ${teamConfig.tools.testing.integration} (integration)

### Getting Help

- Team chat: #${teamConfig.team.name.toLowerCase().replace(/\s+/g, '-')}
- Documentation: ./docs/
- Issues: GitHub Issues tab`;
  }

  getBranchingStrategyGuide(strategy) {
    switch (strategy) {
      case 'gitflow':
        return `
**Gitflow Strategy:**
- \`main\`: Production-ready code
- \`develop\`: Integration branch for features
- \`feature/*\`: New features (branch from develop)
- \`release/*\`: Release preparation (branch from develop)
- \`hotfix/*\`: Emergency fixes (branch from main)`;

      case 'github-flow':
        return `
**GitHub Flow Strategy:**
- \`main\`: Always deployable
- \`feature/*\`: All new work (branch from main)
- Direct deployment from main
- Short-lived branches`;

      case 'gitlab-flow':
        return `
**GitLab Flow Strategy:**
- \`main\`: Development branch
- \`production\`: Production environment
- \`feature/*\`: New features (branch from main)
- Environment-specific branches for staging`;

      default:
        return `
**Custom Strategy:**
Follow team-specific branching guidelines.
Consult team documentation for details.`;
    }
  }

  enhanceClaudeWithTeamStandards(claudeContent, teamConfig) {
    const teamSection = `

## 🏢 Team Configuration - ${teamConfig.team.name}

### Team Standards
- **Code Style**: ${teamConfig.standards.codeStyle}
- **Test Coverage**: ${teamConfig.standards.testCoverage}%
- **Review Process**: ${teamConfig.standards.reviewRequired ? 'Required' : 'Optional'}
- **Workflow**: ${teamConfig.workflow.branchingStrategy}

### Agent Coordination for Team Development

\`\`\`javascript
// ✅ TEAM WORKFLOW: Coordinated development with team standards
[Single Message]:
  Task("Team Lead", "Coordinate team development and ensure standards compliance", "team-coordinator")
  Task("Code Reviewer", "Review code against team standards: ${teamConfig.standards.codeStyle}", "reviewer")
  Task("Quality Engineer", "Ensure ${teamConfig.standards.testCoverage}% test coverage", "tester")
  Task("DevOps Engineer", "Manage ${teamConfig.workflow.deploymentStrategy} deployment pipeline", "cicd-engineer")

  // Team development todos
  TodoWrite({ todos: [
    {content: "Follow ${teamConfig.workflow.branchingStrategy} workflow", status: "in_progress", activeForm: "Following team workflow"},
    {content: "Implement with ${teamConfig.standards.codeStyle} standards", status: "pending", activeForm: "Implementing with team standards"},
    {content: "Achieve ${teamConfig.standards.testCoverage}% test coverage", status: "pending", activeForm: "Achieving test coverage"},
    {content: "Request team code review", status: "pending", activeForm: "Requesting team code review"},
    {content: "Deploy via ${teamConfig.workflow.deploymentStrategy} pipeline", status: "pending", activeForm: "Deploying via team pipeline"}
  ]})
\`\`\`

### Team Tools and Integration

**Development Tools:**
- Linter: ${teamConfig.tools.linter}
- Formatter: ${teamConfig.tools.formatter}
- Bundler: ${teamConfig.tools.bundler}
- Testing: ${teamConfig.tools.testing.unit} + ${teamConfig.tools.testing.integration}

**Team Resources:**
- Documentation: ./docs/team/
- Standards Guide: ./CONTRIBUTING.md
- Workflow Guide: ./.github/workflows/`;

    return claudeContent + teamSection;
  }

  // Validate team configuration
  validateTeamConfig(config) {
    const errors = [];

    if (!config.team?.name) {
      errors.push('Team name is required');
    }

    if (!config.team?.id) {
      errors.push('Team ID is required');
    }

    if (config.standards?.testCoverage !== undefined) {
      const coverage = parseInt(config.standards.testCoverage);
      if (isNaN(coverage) || coverage < 0 || coverage > 100) {
        errors.push('Test coverage must be between 0 and 100');
      }
    }

    return errors;
  }
}
```

### Multi-Project Portfolio Management

#### Portfolio Configuration System
```javascript
// src/enterprise/portfolio-manager.js

export class PortfolioManager {
  constructor() {
    this.projects = new Map();
    this.sharedResources = new Map();
    this.templates = new Map();
  }

  // Register project in portfolio
  async registerProject(projectConfig) {
    const { name, type, template, dependencies, agents } = projectConfig;

    const project = {
      name,
      type,
      template,
      dependencies: dependencies || [],
      agents: agents || [],
      status: 'registered',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    this.projects.set(name, project);

    // Setup project-specific resources
    await this.setupProjectResources(project);

    return project;
  }

  // Generate portfolio-wide configuration
  async generatePortfolioConfig() {
    const portfolioConfig = {
      projects: Array.from(this.projects.values()),
      sharedResources: this.getSharedResourcesConfig(),
      crossProjectDependencies: this.analyzeCrossProjectDependencies(),
      recommendedStandards: this.generateStandardsRecommendations()
    };

    return portfolioConfig;
  }

  // Setup shared resources
  setupSharedResource(name, config) {
    this.sharedResources.set(name, {
      name,
      type: config.type,
      config,
      usedBy: [],
      createdAt: new Date().toISOString()
    });
  }

  // Analyze dependencies across projects
  analyzeCrossProjectDependencies() {
    const dependencies = [];

    for (const [projectName, project] of this.projects) {
      for (const dependency of project.dependencies) {
        if (this.projects.has(dependency)) {
          dependencies.push({
            from: projectName,
            to: dependency,
            type: 'project-dependency'
          });
        }
      }
    }

    return dependencies;
  }

  // Generate standards recommendations
  generateStandardsRecommendations() {
    const projectTypes = Array.from(this.projects.values()).map(p => p.type);
    const typeCount = {};

    projectTypes.forEach(type => {
      typeCount[type] = (typeCount[type] || 0) + 1;
    });

    // Recommend standards based on most common project types
    const recommendations = [];

    if (typeCount['react-spa'] > 0) {
      recommendations.push({
        area: 'frontend',
        standard: 'react-best-practices',
        reason: 'Multiple React projects detected',
        impact: 'high'
      });
    }

    if (typeCount['node-api'] > 0) {
      recommendations.push({
        area: 'backend',
        standard: 'express-patterns',
        reason: 'Multiple Node.js APIs detected',
        impact: 'high'
      });
    }

    return recommendations;
  }

  // Setup project-specific resources
  async setupProjectResources(project) {
    const resourcesDir = `./portfolio/${project.name}/resources`;

    // Create project-specific Claude configuration
    await this.generateProjectClaudeConfig(project, resourcesDir);

    // Setup shared resource links
    await this.linkSharedResources(project, resourcesDir);
  }

  async generateProjectClaudeConfig(project, resourcesDir) {
    const config = {
      project: project.name,
      type: project.type,
      template: project.template,
      portfolio: {
        dependencies: project.dependencies,
        sharedResources: this.getProjectSharedResources(project),
        coordination: {
          crossProjectAgents: this.getCrossProjectAgents(project),
          sharedMemory: true,
          portfolioMetrics: true
        }
      }
    };

    const fs = await import('fs/promises');
    const path = await import('path');

    await fs.mkdir(resourcesDir, { recursive: true });
    await fs.writeFile(
      path.join(resourcesDir, 'portfolio-config.json'),
      JSON.stringify(config, null, 2)
    );
  }

  getProjectSharedResources(project) {
    return Array.from(this.sharedResources.values()).filter(resource =>
      resource.usedBy.includes(project.name)
    );
  }

  getCrossProjectAgents(project) {
    const crossProjectAgents = [];

    // Add integration agents for dependent projects
    for (const dependency of project.dependencies) {
      if (this.projects.has(dependency)) {
        crossProjectAgents.push({
          name: `integration-${dependency}`,
          type: 'integration-specialist',
          target: dependency,
          role: 'coordinate-with-dependency'
        });
      }
    }

    return crossProjectAgents;
  }
}
```

## API Reference

### Template API

#### Template Interface
```typescript
interface TemplateInterface {
  name: string;
  version: string;

  getMetadata(): TemplateMetadata;
  generate(context: TemplateContext): Promise<TemplateResult>;
  validate(context: TemplateContext): ValidationResult;
}

interface TemplateMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  supportedLanguages: string[];
  supportedFrameworks: string[];
  requirements: Record<string, string>;
}

interface TemplateContext {
  language: string;
  framework?: string;
  preferences: UserPreferences;
  projectInfo: ProjectInfo;
  customData?: Record<string, any>;
}

interface TemplateResult {
  files: Map<string, string>;
  directories: string[];
  commands: string[];
  instructions: string[];
}
```

#### Preference API
```typescript
interface PreferenceManager {
  loadPreferences(): Promise<UserPreferences>;
  set(key: string, value: any, scope?: 'global' | 'project'): Promise<boolean>;
  get(key: string, defaultValue?: any): Promise<any>;
  validate(): Promise<ValidationResult>;
  generateSuggestions(): Promise<PreferenceSuggestion[]>;
}

interface UserPreferences {
  experience: ExperiencePreferences;
  documentation: DocumentationPreferences;
  feedback: FeedbackPreferences;
  workflow: WorkflowPreferences;
  advanced: AdvancedPreferences;
  project: ProjectPreferences;
  [key: string]: any; // Custom categories
}
```

#### Plugin API
```typescript
interface PluginInterface {
  name: string;
  version: string;

  getMetadata(): PluginMetadata;
  initialize(config: Record<string, any>): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  registerHook(hookName: string, handler: HookHandler): void;
  executeHook(hookName: string, context: any): Promise<any[]>;
}

interface HookHandler {
  (context: any): Promise<any>;
}

interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies: string[];
  hooks: string[];
}
```

## Migration Guide

### Upgrading from v1.x to v2.x

#### Breaking Changes
1. **Template API**: Template generators now use async methods
2. **Preference Schema**: New validation system with stricter type checking
3. **Plugin System**: Hooks now require explicit registration
4. **File Structure**: `.claude-flow-novice` directory structure changes

#### Migration Steps

##### 1. Update Template Generators
```javascript
// v1.x (deprecated)
class OldTemplate {
  generate(context) {
    return {
      'CLAUDE.md': this.generateClaude(context)
    };
  }
}

// v2.x (new)
class NewTemplate {
  async generate(context) {
    const files = new Map();
    files.set('CLAUDE.md', await this.generateClaude(context));

    return {
      files,
      directories: ['src', 'tests'],
      commands: ['npm install'],
      instructions: ['Run setup wizard']
    };
  }
}
```

##### 2. Update Preference Schema
```javascript
// v1.x preference file
{
  "verbosity": "high",
  "agents": ["coder", "reviewer"]
}

// v2.x preference file
{
  "documentation": {
    "verbosity": "detailed"
  },
  "workflow": {
    "defaultAgents": ["coder", "reviewer"]
  }
}
```

##### 3. Plugin Migration
```javascript
// v1.x plugin (deprecated)
const plugin = {
  name: 'my-plugin',
  hooks: {
    'pre-task': (context) => { /* handler */ }
  }
};

// v2.x plugin (new)
class MyPlugin extends PluginInterface {
  constructor() {
    super('my-plugin', '2.0.0');
    this.registerHook('pre-task', this.handlePreTask.bind(this));
  }

  async handlePreTask(context) {
    // handler
  }
}
```

### Automated Migration Tool

```bash
# Run migration tool
claude-flow-novice migrate --from=1.x --to=2.x

# Backup existing configuration
claude-flow-novice migrate --backup

# Validate migration
claude-flow-novice migrate --validate
```

## Testing and Validation

### Template Testing Framework

#### Unit Testing Templates
```javascript
// test/templates/my-template.test.js

import { MyCustomTemplate } from '../../src/templates/custom/my-template.js';

describe('MyCustomTemplate', () => {
  let template;

  beforeEach(() => {
    template = new MyCustomTemplate();
  });

  describe('metadata', () => {
    it('should return valid metadata', () => {
      const metadata = template.getMetadata();

      expect(metadata.name).toBe('my-custom-template');
      expect(metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(metadata.supportedLanguages).toContain('javascript');
    });
  });

  describe('generation', () => {
    it('should generate required files', async () => {
      const context = {
        language: 'javascript',
        framework: 'react',
        preferences: {
          experience: { level: 'beginner' },
          documentation: { verbosity: 'detailed' }
        },
        projectInfo: {
          buildTool: 'vite',
          packageManager: 'npm'
        }
      };

      const result = await template.generate(context);

      expect(result.files.has('CLAUDE.md')).toBe(true);
      expect(result.files.has('.claude/workflows/custom-workflow.md')).toBe(true);
      expect(result.directories).toContain('src');
      expect(result.commands).toContain('npm install');
    });

    it('should adapt to user experience level', async () => {
      const beginnerContext = {
        language: 'javascript',
        preferences: { experience: { level: 'beginner' } },
        projectInfo: {}
      };

      const advancedContext = {
        language: 'javascript',
        preferences: { experience: { level: 'advanced' } },
        projectInfo: {}
      };

      const beginnerResult = await template.generate(beginnerContext);
      const advancedResult = await template.generate(advancedContext);

      const beginnerClaude = beginnerResult.files.get('CLAUDE.md');
      const advancedClaude = advancedResult.files.get('CLAUDE.md');

      expect(beginnerClaude).toContain('Learning Mode');
      expect(advancedClaude).toContain('Production Mode');
    });
  });

  describe('validation', () => {
    it('should validate required context fields', () => {
      const invalidContext = {};
      const errors = template.validate(invalidContext);

      expect(errors).toContain('Language must be specified');
    });

    it('should validate supported frameworks', () => {
      const context = {
        language: 'javascript',
        framework: 'unsupported-framework',
        projectInfo: {}
      };

      const errors = template.validate(context);
      expect(errors.some(e => e.includes('not supported'))).toBe(true);
    });
  });
});
```

#### Integration Testing
```javascript
// test/integration/template-system.test.js

import { TemplateRegistry } from '../../src/templates/template-registry.js';
import { PreferenceManager } from '../../src/preferences/preference-manager.js';

describe('Template System Integration', () => {
  let registry;
  let preferenceManager;

  beforeEach(() => {
    registry = new TemplateRegistry();
    preferenceManager = new PreferenceManager();
  });

  it('should generate template with user preferences', async () => {
    // Setup preferences
    await preferenceManager.set('experience.level', 'intermediate');
    await preferenceManager.set('workflow.concurrency', 3);

    // Generate template
    const template = await registry.getTemplate('enhanced');
    const preferences = await preferenceManager.loadPreferences();

    const context = {
      language: 'typescript',
      framework: 'react',
      preferences,
      projectInfo: { buildTool: 'vite' }
    };

    const result = await template.generate(context);

    // Verify preference integration
    const claudeContent = result.files.get('CLAUDE.md');
    expect(claudeContent).toContain('concurrency: 3');
    expect(claudeContent).toContain('intermediate');
  });
});
```

### Performance Testing

#### Template Generation Performance
```javascript
// test/performance/template-performance.test.js

describe('Template Performance', () => {
  it('should generate templates within acceptable time', async () => {
    const template = new MyCustomTemplate();
    const context = createTestContext();

    const startTime = performance.now();
    const result = await template.generate(context);
    const endTime = performance.now();

    const generationTime = endTime - startTime;
    expect(generationTime).toBeLessThan(1000); // 1 second max
  });

  it('should handle large project contexts efficiently', async () => {
    const largeContext = createLargeTestContext(); // 1000+ files
    const template = new MyCustomTemplate();

    const startTime = performance.now();
    await template.generate(largeContext);
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max
  });
});
```

### Validation Tools

#### Template Validator
```bash
# Validate template syntax and structure
claude-flow-novice template validate my-custom-template

# Validate against multiple contexts
claude-flow-novice template validate my-custom-template --contexts=test-contexts.json

# Performance validation
claude-flow-novice template validate my-custom-template --performance

# Output detailed validation report
claude-flow-novice template validate my-custom-template --report=validation-report.json
```

#### Preference Validator
```bash
# Validate preference schema
claude-flow-novice preferences validate

# Validate custom preference categories
claude-flow-novice preferences validate --custom-schema=my-schema.json

# Test preference migration
claude-flow-novice preferences validate --migration-test
```

This comprehensive customization guide provides the tools and knowledge needed to extend Claude Flow Novice for any specific use case, from simple custom templates to enterprise-grade multi-project configurations.