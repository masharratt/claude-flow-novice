// preference-wizard.js - Interactive user preference collection wizard
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

export class PreferenceWizard {
  constructor() {
    this.preferences = {};
    this.projectDetection = new ProjectDetection();
    this.preferenceSchema = new PreferenceSchema();
  }

  async run(options = {}) {
    const spinner = ora('Initializing preference wizard...').start();

    try {
      // Create preferences directory if it doesn't exist
      const prefsDir = path.join(process.cwd(), '.claude-flow-novice', 'preferences');
      await fs.ensureDir(prefsDir);

      spinner.succeed('Preference wizard initialized');

      console.log(chalk.blue.bold('\n🧙‍♂️ Claude Flow Novice - Preference Setup Wizard\n'));
      console.log(
        chalk.gray(
          'This wizard will help you configure your preferences for the best experience.\n',
        ),
      );

      // Step 1: Project detection
      await this.detectProject();

      // Step 2: Experience level
      await this.collectExperienceLevel();

      // Step 3: Documentation preferences
      await this.collectDocumentationPreferences();

      // Step 4: Feedback and tone preferences
      await this.collectFeedbackPreferences();

      // Step 5: Agent and workflow preferences
      await this.collectWorkflowPreferences();

      // Step 6: Advanced preferences (if experienced user)
      if (this.preferences.experience.level !== 'beginner') {
        await this.collectAdvancedPreferences();
      }

      // Step 7: Save preferences
      await this.savePreferences();

      console.log(chalk.green.bold('\n✅ Preferences configured successfully!'));
      console.log(
        chalk.gray(
          'You can update these anytime with: claude-flow-novice preferences set <key> <value>',
        ),
      );

      return this.preferences;
    } catch (error) {
      spinner.fail('Failed to initialize preference wizard');
      throw error;
    }
  }

  async detectProject() {
    const spinner = ora('Detecting project environment...').start();

    try {
      const detection = await this.projectDetection.analyze();
      this.preferences.project = detection;

      spinner.succeed(`Detected: ${detection.language || 'Unknown'} project`);

      if (detection.frameworks.length > 0) {
        console.log(chalk.cyan(`  Frameworks: ${detection.frameworks.join(', ')}`));
      }

      if (detection.buildTool) {
        console.log(chalk.cyan(`  Build tool: ${detection.buildTool}`));
      }
    } catch (error) {
      spinner.warn('Could not detect project environment');
      this.preferences.project = { language: 'unknown', frameworks: [], buildTool: null };
    }
  }

  async collectExperienceLevel() {
    console.log(chalk.blue('\n📚 Experience Level'));

    const { level, background, goals } = await inquirer.prompt([
      {
        type: 'list',
        name: 'level',
        message: 'What is your experience level with AI-assisted development?',
        choices: [
          { name: '🟢 Beginner - New to AI development tools', value: 'beginner' },
          { name: '🟡 Intermediate - Some experience with AI tools', value: 'intermediate' },
          { name: '🔴 Advanced - Experienced with AI development workflows', value: 'advanced' },
        ],
      },
      {
        type: 'checkbox',
        name: 'background',
        message: 'What best describes your development background?',
        choices: [
          'Frontend Development',
          'Backend Development',
          'Full-Stack Development',
          'DevOps/Infrastructure',
          'Data Science/ML',
          'Mobile Development',
          'Desktop Applications',
          'Game Development',
          'Other',
        ],
      },
      {
        type: 'input',
        name: 'goals',
        message: 'What are your main goals with Claude Flow Novice? (optional)',
        default: '',
      },
    ]);

    this.preferences.experience = { level, background, goals };
  }

  async collectDocumentationPreferences() {
    console.log(chalk.blue('\n📖 Documentation & Guidance'));

    const { verbosity, explanations, codeComments, stepByStep } = await inquirer.prompt([
      {
        type: 'list',
        name: 'verbosity',
        message: 'How much detail do you want in explanations?',
        choices: [
          { name: '📝 Minimal - Just the essentials', value: 'minimal' },
          { name: '📄 Standard - Balanced explanations', value: 'standard' },
          { name: '📚 Detailed - Comprehensive explanations', value: 'detailed' },
          { name: '🔍 Verbose - Very detailed with examples', value: 'verbose' },
        ],
        default: this.preferences.experience?.level === 'beginner' ? 'detailed' : 'standard',
      },
      {
        type: 'confirm',
        name: 'explanations',
        message: 'Include explanations of AI agent decisions and reasoning?',
        default: this.preferences.experience?.level === 'beginner',
      },
      {
        type: 'list',
        name: 'codeComments',
        message: 'How much code commenting do you prefer?',
        choices: [
          { name: 'Minimal - Only complex logic', value: 'minimal' },
          { name: 'Standard - Key functions and classes', value: 'standard' },
          { name: 'Detailed - Most functions and important blocks', value: 'detailed' },
          { name: 'Extensive - Nearly everything explained', value: 'extensive' },
        ],
        default: 'standard',
      },
      {
        type: 'confirm',
        name: 'stepByStep',
        message: 'Show step-by-step progress for complex operations?',
        default: true,
      },
    ]);

    this.preferences.documentation = { verbosity, explanations, codeComments, stepByStep };
  }

  async collectFeedbackPreferences() {
    console.log(chalk.blue('\n💬 Communication & Feedback'));

    const { tone, errorHandling, notifications, confirmations } = await inquirer.prompt([
      {
        type: 'list',
        name: 'tone',
        message: 'What communication tone do you prefer?',
        choices: [
          { name: '🤖 Professional - Formal and precise', value: 'professional' },
          { name: '😊 Friendly - Warm and encouraging', value: 'friendly' },
          { name: '🎯 Direct - Concise and to-the-point', value: 'direct' },
          { name: '🎓 Educational - Teaching-focused explanations', value: 'educational' },
        ],
        default: 'friendly',
      },
      {
        type: 'list',
        name: 'errorHandling',
        message: 'How should errors and issues be presented?',
        choices: [
          { name: '🚨 Immediate - Stop and show errors right away', value: 'immediate' },
          { name: '📋 Summary - Collect and show at the end', value: 'summary' },
          { name: '🔧 Guided - Provide suggestions to fix errors', value: 'guided' },
        ],
        default: 'guided',
      },
      {
        type: 'confirm',
        name: 'notifications',
        message: 'Enable progress notifications for long-running tasks?',
        default: true,
      },
      {
        type: 'list',
        name: 'confirmations',
        message: 'When should the system ask for confirmation?',
        choices: [
          { name: 'Never - Run commands without asking', value: 'never' },
          { name: 'Destructive - Only for potentially harmful operations', value: 'destructive' },
          { name: 'Important - For significant changes', value: 'important' },
          { name: 'Always - Ask before any operation', value: 'always' },
        ],
        default: 'important',
      },
    ]);

    this.preferences.feedback = { tone, errorHandling, notifications, confirmations };
  }

  async collectWorkflowPreferences() {
    console.log(chalk.blue('\n🔧 Workflow & Agent Preferences'));

    const { defaultAgents, concurrency, autoSave, testRunning } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'defaultAgents',
        message: 'Which agents do you want enabled by default?',
        choices: [
          {
            name: '🔬 Researcher - Analyzes requirements and best practices',
            value: 'researcher',
            checked: true,
          },
          { name: '💻 Coder - Implements features and fixes', value: 'coder', checked: true },
          { name: '👀 Reviewer - Reviews code quality and standards', value: 'reviewer' },
          { name: '📋 Planner - Creates project plans and task breakdowns', value: 'planner' },
          { name: '🧪 Tester - Creates and runs tests', value: 'tester' },
        ],
      },
      {
        type: 'list',
        name: 'concurrency',
        message: 'How many agents should work simultaneously?',
        choices: [
          { name: '1 - Sequential (safer, slower)', value: 1 },
          { name: '2 - Light parallel (balanced)', value: 2 },
          { name: '3 - Moderate parallel (faster)', value: 3 },
          { name: '4 - Heavy parallel (fastest, more complex)', value: 4 },
        ],
        default: this.preferences.experience?.level === 'beginner' ? 2 : 3,
      },
      {
        type: 'confirm',
        name: 'autoSave',
        message: 'Automatically save progress and intermediate results?',
        default: true,
      },
      {
        type: 'list',
        name: 'testRunning',
        message: 'When should tests be automatically run?',
        choices: [
          { name: 'Never - Manual testing only', value: 'never' },
          { name: 'On completion - After major changes', value: 'completion' },
          { name: 'Continuous - After each significant change', value: 'continuous' },
        ],
        default: 'completion',
      },
    ]);

    this.preferences.workflow = { defaultAgents, concurrency, autoSave, testRunning };
  }

  async collectAdvancedPreferences() {
    console.log(chalk.blue('\n⚙️ Advanced Configuration'));

    const { memoryPersistence, neuralLearning, hookIntegration, customAgents } =
      await inquirer.prompt([
        {
          type: 'confirm',
          name: 'memoryPersistence',
          message: 'Enable cross-session memory persistence?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'neuralLearning',
          message: 'Enable neural pattern learning and optimization?',
          default: false,
        },
        {
          type: 'confirm',
          name: 'hookIntegration',
          message: 'Enable advanced hooks and automation?',
          default: false,
        },
        {
          type: 'input',
          name: 'customAgents',
          message: 'Custom agent configurations (comma-separated, optional):',
          default: '',
        },
      ]);

    this.preferences.advanced = {
      memoryPersistence,
      neuralLearning,
      hookIntegration,
      customAgents,
    };
  }

  async savePreferences() {
    const spinner = ora('Saving preferences...').start();

    try {
      const prefsPath = path.join(
        process.cwd(),
        '.claude-flow-novice',
        'preferences',
        'user-global.json',
      );

      // Add metadata
      this.preferences.meta = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wizard: true,
      };

      await fs.writeJson(prefsPath, this.preferences, { spaces: 2 });
      spinner.succeed(`Preferences saved to ${prefsPath}`);
    } catch (error) {
      spinner.fail('Failed to save preferences');
      throw error;
    }
  }
}

// Project detection utility
class ProjectDetection {
  async analyze() {
    const result = {
      language: null,
      frameworks: [],
      buildTool: null,
      packageManager: null,
      environment: 'development',
    };

    // Check for package.json (Node.js/JavaScript/TypeScript)
    if (await fs.pathExists('package.json')) {
      try {
        const pkg = await fs.readJson('package.json');
        result.language = 'javascript';

        if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
          result.language = 'typescript';
        }

        // Detect frameworks
        this.detectJSFrameworks(pkg, result);

        // Detect package manager
        if (await fs.pathExists('yarn.lock')) result.packageManager = 'yarn';
        else if (await fs.pathExists('pnpm-lock.yaml')) result.packageManager = 'pnpm';
        else if (await fs.pathExists('package-lock.json')) result.packageManager = 'npm';

        // Detect build tools
        if (pkg.scripts?.build) result.buildTool = 'npm-scripts';
        if (pkg.devDependencies?.webpack) result.buildTool = 'webpack';
        if (pkg.devDependencies?.vite) result.buildTool = 'vite';
      } catch (error) {
        console.warn('Could not read package.json');
      }
    }

    // Check for Python
    if ((await fs.pathExists('requirements.txt')) || (await fs.pathExists('pyproject.toml'))) {
      result.language = 'python';
      if (await fs.pathExists('requirements.txt')) result.buildTool = 'pip';
      if (await fs.pathExists('pyproject.toml')) result.buildTool = 'poetry';
    }

    // Check for other languages
    if (await fs.pathExists('Cargo.toml')) {
      result.language = 'rust';
      result.buildTool = 'cargo';
    }

    if (await fs.pathExists('go.mod')) {
      result.language = 'go';
      result.buildTool = 'go';
    }

    if ((await fs.pathExists('pom.xml')) || (await fs.pathExists('build.gradle'))) {
      result.language = 'java';
      result.buildTool = (await fs.pathExists('pom.xml')) ? 'maven' : 'gradle';
    }

    return result;
  }

  detectJSFrameworks(pkg, result) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.react) result.frameworks.push('React');
    if (deps.vue) result.frameworks.push('Vue');
    if (deps['@angular/core']) result.frameworks.push('Angular');
    if (deps.svelte) result.frameworks.push('Svelte');
    if (deps.next) result.frameworks.push('Next.js');
    if (deps.nuxt) result.frameworks.push('Nuxt.js');
    if (deps.express) result.frameworks.push('Express');
    if (deps.fastify) result.frameworks.push('Fastify');
    if (deps.nestjs) result.frameworks.push('NestJS');
  }
}

// Preference schema and validation
class PreferenceSchema {
  getDefaults() {
    return {
      experience: {
        level: 'beginner',
        background: ['Full-Stack Development'],
        goals: '',
      },
      documentation: {
        verbosity: 'standard',
        explanations: true,
        codeComments: 'standard',
        stepByStep: true,
      },
      feedback: {
        tone: 'friendly',
        errorHandling: 'guided',
        notifications: true,
        confirmations: 'important',
      },
      workflow: {
        defaultAgents: ['researcher', 'coder'],
        concurrency: 2,
        autoSave: true,
        testRunning: 'completion',
      },
      advanced: {
        memoryPersistence: false,
        neuralLearning: false,
        hookIntegration: false,
        customAgents: '',
      },
      project: {
        language: 'unknown',
        frameworks: [],
        buildTool: null,
      },
    };
  }

  validate(preferences) {
    const errors = [];
    const defaults = this.getDefaults();

    // Validate experience level
    const validLevels = ['beginner', 'intermediate', 'advanced'];
    if (!validLevels.includes(preferences.experience?.level)) {
      errors.push('Invalid experience level');
    }

    // Validate concurrency
    if (preferences.workflow?.concurrency < 1 || preferences.workflow?.concurrency > 8) {
      errors.push('Concurrency must be between 1 and 8');
    }

    // Validate verbosity
    const validVerbosity = ['minimal', 'standard', 'detailed', 'verbose'];
    if (!validVerbosity.includes(preferences.documentation?.verbosity)) {
      errors.push('Invalid documentation verbosity');
    }

    return errors;
  }
}

export default PreferenceWizard;
