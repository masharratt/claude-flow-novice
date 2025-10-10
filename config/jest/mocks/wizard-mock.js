/**
 * Mock Wizard for Jest Testing
 * Provides mock implementation for missing wizard modules
 */

export class CLIWizard {
  constructor(options = {}) {
    this.options = options;
    this.steps = [];
    this.currentStep = 0;
    this.answers = {};
    this.initialized = false;
  }

  async initialize() {
    this.initialized = true;
    return true;
  }

  async shutdown() {
    this.initialized = false;
    return true;
  }

  addStep(step) {
    this.steps.push({
      id: step.id || `step_${this.steps.length + 1}`,
      type: step.type || 'input',
      question: step.question || 'Default question',
      options: step.options || [],
      validate: step.validate || (() => true),
      default: step.default
    });
  }

  async run() {
    if (!this.initialized) {
      throw new Error('Wizard not initialized');
    }

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      this.currentStep = i;

      // Mock user input based on step type
      let answer;
      switch (step.type) {
        case 'input':
          answer = step.default || 'default_answer';
          break;
        case 'select':
          answer = step.options?.[0]?.value || 'default_option';
          break;
        case 'confirm':
          answer = true;
          break;
        case 'number':
          answer = step.default || 1;
          break;
        default:
          answer = step.default || null;
      }

      this.answers[step.id] = answer;
    }

    return {
      completed: true,
      answers: this.answers,
      steps: this.steps.length,
      duration: Math.floor(Math.random() * 5000) + 1000
    };
  }

  async getCurrentStep() {
    if (!this.initialized) {
      throw new Error('Wizard not initialized');
    }

    return this.steps[this.currentStep] || null;
  }

  async getProgress() {
    if (!this.initialized) {
      throw new Error('Wizard not initialized');
    }

    return {
      current: this.currentStep + 1,
      total: this.steps.length,
      percentage: Math.round(((this.currentStep + 1) / this.steps.length) * 100)
    };
  }

  async setAnswer(stepId, answer) {
    if (!this.initialized) {
      throw new Error('Wizard not initialized');
    }

    this.answers[stepId] = answer;
    return true;
  }

  async getAnswer(stepId) {
    if (!this.initialized) {
      throw new Error('Wizard not initialized');
    }

    return this.answers[stepId];
  }

  async validateStep(stepId, answer) {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step with id '${stepId}' not found`);
    }

    try {
      const result = await step.validate(answer);
      return {
        valid: true,
        result
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async reset() {
    this.currentStep = 0;
    this.answers = {};
    return true;
  }
}

export class ProjectWizard extends CLIWizard {
  constructor(options = {}) {
    super(options);
    this.projectType = options.projectType || 'generic';
    this.setupProjectDefaults();
  }

  setupProjectDefaults() {
    // Add common project setup steps
    this.addStep({
      id: 'project_name',
      type: 'input',
      question: 'What is your project name?',
      default: 'my-project'
    });

    this.addStep({
      id: 'project_type',
      type: 'select',
      question: 'What type of project?',
      options: [
        { value: 'web', label: 'Web Application' },
        { value: 'api', label: 'REST API' },
        { value: 'cli', label: 'CLI Tool' },
        { value: 'library', label: 'Library' }
      ]
    });

    this.addStep({
      id: 'use_typescript',
      type: 'confirm',
      question: 'Use TypeScript?',
      default: true
    });

    this.addStep({
      id: 'add_tests',
      type: 'confirm',
      question: 'Add test setup?',
      default: true
    });
  }

  async generateProject() {
    const wizardResult = await this.run();

    return {
      ...wizardResult,
      projectConfig: {
        name: wizardResult.answers.project_name,
        type: wizardResult.answers.project_type,
        typescript: wizardResult.answers.use_typescript,
        testing: wizardResult.answers.add_tests,
        generatedAt: new Date().toISOString(),
        files: [
          'package.json',
          'README.md',
          wizardResult.answers.use_typescript ? 'tsconfig.json' : null,
          wizardResult.answers.add_tests ? 'jest.config.js' : null
        ].filter(Boolean)
      }
    };
  }
}

export default {
  CLIWizard,
  ProjectWizard
};