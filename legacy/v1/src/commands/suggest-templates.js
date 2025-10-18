/**
 * /suggest-templates slash command
 * Provides contextual templates based on detected project patterns
 * Integrates with framework detection and user preferences
 */

const fs = require('fs').promises;
const path = require('path');

class ProjectTemplateSuggester {
  constructor() {
    this.templates = new Map();
    this.initializeTemplates();
  }

  initializeTemplates() {
    // React Templates
    this.templates.set('react-component', {
      name: 'React Component Template',
      description: 'Functional component with TypeScript and testing setup',
      framework: 'react',
      category: 'Component',
      files: {
        'src/components/{{ComponentName}}/{{ComponentName}}.tsx': this.getReactComponentTemplate(),
        'src/components/{{ComponentName}}/{{ComponentName}}.test.tsx': this.getReactTestTemplate(),
        'src/components/{{ComponentName}}/{{ComponentName}}.stories.tsx': this.getStorybookTemplate(),
        'src/components/{{ComponentName}}/index.ts': this.getIndexTemplate()
      },
      dependencies: ['@types/react', '@testing-library/react'],
      devDependencies: ['@storybook/react']
    });

    // Node.js API Templates
    this.templates.set('express-route', {
      name: 'Express Route Template',
      description: 'RESTful API route with validation and testing',
      framework: 'express',
      category: 'API',
      files: {
        'src/routes/{{routeName}}.js': this.getExpressRouteTemplate(),
        'src/controllers/{{routeName}}Controller.js': this.getExpressControllerTemplate(),
        'src/middleware/{{routeName}}Validation.js': this.getValidationTemplate(),
        'tests/routes/{{routeName}}.test.js': this.getExpressTestTemplate()
      },
      dependencies: ['express', 'joi', 'express-validator'],
      devDependencies: ['supertest', 'jest']
    });

    // Database Templates
    this.templates.set('mongoose-model', {
      name: 'Mongoose Model Template',
      description: 'MongoDB model with validation and methods',
      framework: 'node',
      category: 'Database',
      files: {
        'src/models/{{ModelName}}.js': this.getMongooseModelTemplate(),
        'src/models/schemas/{{ModelName}}Schema.js': this.getMongooseSchemaTemplate(),
        'tests/models/{{ModelName}}.test.js': this.getModelTestTemplate()
      },
      dependencies: ['mongoose', 'validator'],
      devDependencies: ['mongodb-memory-server']
    });

    // Configuration Templates
    this.templates.set('github-actions', {
      name: 'GitHub Actions CI/CD',
      description: 'Complete CI/CD pipeline with testing and deployment',
      framework: 'any',
      category: 'DevOps',
      files: {
        '.github/workflows/ci.yml': this.getGitHubActionsTemplate(),
        '.github/workflows/deploy.yml': this.getDeploymentTemplate(),
        '.github/PULL_REQUEST_TEMPLATE.md': this.getPRTemplate()
      },
      dependencies: [],
      devDependencies: []
    });

    // Docker Templates
    this.templates.set('docker-setup', {
      name: 'Docker Configuration',
      description: 'Multi-stage Docker setup with development and production',
      framework: 'any',
      category: 'DevOps',
      files: {
        'Dockerfile': this.getDockerfileTemplate(),
        'docker-compose.yml': this.getDockerComposeTemplate(),
        'docker-compose.dev.yml': this.getDockerDevTemplate(),
        '.dockerignore': this.getDockerIgnoreTemplate()
      },
      dependencies: [],
      devDependencies: []
    });

    // Testing Templates
    this.templates.set('jest-setup', {
      name: 'Jest Testing Setup',
      description: 'Complete Jest configuration with coverage and utilities',
      framework: 'any',
      category: 'Testing',
      files: {
        'jest.config.js': this.getJestConfigTemplate(),
        'tests/setup.js': this.getTestSetupTemplate(),
        'tests/utils/testHelpers.js': this.getTestHelpersTemplate(),
        'tests/fixtures/mockData.js': this.getMockDataTemplate()
      },
      dependencies: [],
      devDependencies: ['jest', '@testing-library/jest-dom', 'jest-environment-jsdom']
    });

    // Security Templates
    this.templates.set('security-config', {
      name: 'Security Configuration',
      description: 'Comprehensive security setup with best practices',
      framework: 'any',
      category: 'Security',
      files: {
        '.env.example': this.getEnvExampleTemplate(),
        'src/config/security.js': this.getSecurityConfigTemplate(),
        'src/middleware/security.js': this.getSecurityMiddlewareTemplate(),
        'SECURITY.md': this.getSecurityDocTemplate()
      },
      dependencies: ['helmet', 'cors', 'express-rate-limit'],
      devDependencies: []
    });
  }

  async analyzeProject(projectPath = process.cwd()) {
    const analysis = {
      framework: await this.detectFramework(projectPath),
      hasDatabase: await this.checkForDatabase(projectPath),
      hasDocker: await this.checkForDocker(projectPath),
      hasCI: await this.checkForCI(projectPath),
      hasTests: await this.checkForTests(projectPath),
      hasSecurity: await this.checkForSecurity(projectPath),
      projectStructure: await this.analyzeProjectStructure(projectPath),
      packageJson: await this.getPackageJson(projectPath)
    };

    return analysis;
  }

  async suggestTemplates(analysis) {
    const suggestions = [];

    // Framework-specific suggestions
    if (analysis.framework === 'react') {
      suggestions.push(this.templates.get('react-component'));
      if (!analysis.hasTests) {
        suggestions.push(this.templates.get('jest-setup'));
      }
    }

    if (analysis.framework === 'express' || analysis.framework === 'node') {
      suggestions.push(this.templates.get('express-route'));
      if (analysis.hasDatabase || this.hasMongooseInDeps(analysis.packageJson)) {
        suggestions.push(this.templates.get('mongoose-model'));
      }
    }

    // Infrastructure suggestions
    if (!analysis.hasDocker) {
      suggestions.push(this.templates.get('docker-setup'));
    }

    if (!analysis.hasCI) {
      suggestions.push(this.templates.get('github-actions'));
    }

    if (!analysis.hasTests) {
      suggestions.push(this.templates.get('jest-setup'));
    }

    if (!analysis.hasSecurity) {
      suggestions.push(this.templates.get('security-config'));
    }

    return suggestions.filter(Boolean);
  }

  async generateTemplate(templateId, options = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    const generatedFiles = {};
    const replacements = this.getReplacements(options);

    for (const [filePath, content] of Object.entries(template.files)) {
      const processedPath = this.processTemplate(filePath, replacements);
      const processedContent = this.processTemplate(content, replacements);
      generatedFiles[processedPath] = processedContent;
    }

    return {
      files: generatedFiles,
      dependencies: template.dependencies,
      devDependencies: template.devDependencies,
      instructions: this.getInstallInstructions(template)
    };
  }

  getReplacements(options) {
    const defaults = {
      ComponentName: options.componentName || 'MyComponent',
      routeName: options.routeName || 'example',
      ModelName: options.modelName || 'User',
      projectName: options.projectName || 'my-app',
      authorName: options.authorName || 'Developer',
      description: options.description || 'A new project'
    };

    return { ...defaults, ...options };
  }

  processTemplate(template, replacements) {
    let processed = template;
    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, value);
    }
    return processed;
  }

  // Template content methods
  getReactComponentTemplate() {
    return `import React from 'react';
import { render, screen } from '@testing-library/react';
import './{{ComponentName}}.css';

interface {{ComponentName}}Props {
  className?: string;
  children?: React.ReactNode;
}

export const {{ComponentName}}: React.FC<{{ComponentName}}Props> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={\`{{ComponentName.toLowerCase()}} \${className}\`} {...props}>
      {children}
    </div>
  );
};

export default {{ComponentName}};`;
  }

  getReactTestTemplate() {
    return `import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {{ComponentName}} from './{{ComponentName}}';

describe('{{ComponentName}}', () => {
  it('renders without crashing', () => {
    render(<{{ComponentName}} />);
  });

  it('applies custom className', () => {
    const customClass = 'custom-class';
    render(<{{ComponentName}} className={customClass} />);

    const component = screen.getByRole('generic');
    expect(component).toHaveClass(customClass);
  });

  it('renders children correctly', () => {
    const testContent = 'Test Content';
    render(<{{ComponentName}}>{testContent}</{{ComponentName}}>);

    expect(screen.getByText(testContent)).toBeInTheDocument();
  });
});`;
  }

  getStorybookTemplate() {
    return `import type { Meta, StoryObj } from '@storybook/react';
import {{ComponentName}} from './{{ComponentName}}';

const meta: Meta<typeof {{ComponentName}}> = {
  title: 'Components/{{ComponentName}}',
  component: {{ComponentName}},
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Default {{ComponentName}}',
  },
};

export const WithCustomClass: Story = {
  args: {
    className: 'custom-styling',
    children: 'Styled {{ComponentName}}',
  },
};`;
  }

  getIndexTemplate() {
    return `export { default, {{ComponentName}} } from './{{ComponentName}}';
export type { {{ComponentName}}Props } from './{{ComponentName}}';`;
  }

  getExpressRouteTemplate() {
    return `const express = require('express');
const {{routeName}}Controller = require('../controllers/{{routeName}}Controller');
const {{routeName}}Validation = require('../middleware/{{routeName}}Validation');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/{{routeName}}
router.get('/', auth.optional, {{routeName}}Controller.getAll);

// GET /api/{{routeName}}/:id
router.get('/:id', {{routeName}}Validation.validateId, {{routeName}}Controller.getById);

// POST /api/{{routeName}}
router.post('/',
  auth.required,
  {{routeName}}Validation.validateCreate,
  {{routeName}}Controller.create
);

// PUT /api/{{routeName}}/:id
router.put('/:id',
  auth.required,
  {{routeName}}Validation.validateId,
  {{routeName}}Validation.validateUpdate,
  {{routeName}}Controller.update
);

// DELETE /api/{{routeName}}/:id
router.delete('/:id',
  auth.required,
  {{routeName}}Validation.validateId,
  {{routeName}}Controller.delete
);

module.exports = router;`;
  }

  getExpressControllerTemplate() {
    return `const asyncHandler = require('express-async-handler');
const {{ModelName}} = require('../models/{{ModelName}}');
const ApiError = require('../utils/ApiError');
const { StatusCodes } = require('http-status-codes');

// @desc    Get all {{routeName}}
// @route   GET /api/{{routeName}}
// @access  Public
const getAll = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, sort = 'createdAt' } = req.query;

  const {{routeName}} = await {{ModelName}}.find()
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

  const total = await {{ModelName}}.countDocuments();

  res.status(StatusCodes.OK).json({
    success: true,
    data: {{routeName}},
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get single {{routeName}}
// @route   GET /api/{{routeName}}/:id
// @access  Public
const getById = asyncHandler(async (req, res) => {
  const {{routeName}} = await {{ModelName}}.findById(req.params.id);

  if (!{{routeName}}) {
    throw new ApiError(StatusCodes.NOT_FOUND, '{{ModelName}} not found');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: {{routeName}}
  });
});

// @desc    Create {{routeName}}
// @route   POST /api/{{routeName}}
// @access  Private
const create = asyncHandler(async (req, res) => {
  const {{routeName}} = await {{ModelName}}.create({
    ...req.body,
    user: req.user.id
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: {{routeName}}
  });
});

// @desc    Update {{routeName}}
// @route   PUT /api/{{routeName}}/:id
// @access  Private
const update = asyncHandler(async (req, res) => {
  let {{routeName}} = await {{ModelName}}.findById(req.params.id);

  if (!{{routeName}}) {
    throw new ApiError(StatusCodes.NOT_FOUND, '{{ModelName}} not found');
  }

  // Check ownership
  if ({{routeName}}.user.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Not authorized to update this {{routeName}}');
  }

  {{routeName}} = await {{ModelName}}.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    data: {{routeName}}
  });
});

// @desc    Delete {{routeName}}
// @route   DELETE /api/{{routeName}}/:id
// @access  Private
const deletE = asyncHandler(async (req, res) => {
  const {{routeName}} = await {{ModelName}}.findById(req.params.id);

  if (!{{routeName}}) {
    throw new ApiError(StatusCodes.NOT_FOUND, '{{ModelName}} not found');
  }

  // Check ownership
  if ({{routeName}}.user.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Not authorized to delete this {{routeName}}');
  }

  await {{routeName}}.remove();

  res.status(StatusCodes.OK).json({
    success: true,
    data: {}
  });
});

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deletE
};`;
  }

  getValidationTemplate() {
    return `const { body, param, validationResult } = require('express-validator');
const { StatusCodes } = require('http-status-codes');
const ApiError = require('../utils/ApiError');

// Validation rules
const validateId = [
  param('id').isMongoId().withMessage('Invalid ID format'),
];

const validateCreate = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
];

const validateUpdate = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));

    throw new ApiError(StatusCodes.BAD_REQUEST, 'Validation failed', errorMessages);
  }

  next();
};

module.exports = {
  validateId: [...validateId, handleValidationErrors],
  validateCreate: [...validateCreate, handleValidationErrors],
  validateUpdate: [...validateUpdate, handleValidationErrors]
};`;
  }

  getGitHubActionsTemplate() {
    return `name: CI/CD Pipeline

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
        node-version: [18.x, 20.x]

    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run linter
      run: npm run lint

    - name: Run tests
      run: npm test -- --coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info

    - name: Build project
      run: npm run build

  security:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Run security audit
      run: npm audit

    - name: Run Snyk security scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: \${{ secrets.SNYK_TOKEN }}`;
  }

  getDockerfileTemplate() {
    return `# Multi-stage build for Node.js application
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package*.json ./

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["npm", "start"]`;
  }

  getJestConfigTemplate() {
    return `module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/src/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};`;
  }

  // Helper methods for analysis
  async detectFramework(projectPath) {
    try {
      const packageJson = await this.getPackageJson(projectPath);
      if (!packageJson) return 'unknown';

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps.react) return 'react';
      if (deps.express) return 'express';
      if (deps.vue) return 'vue';
      if (deps.angular) return 'angular';

      return 'node';
    } catch (e) {
      return 'unknown';
    }
  }

  async getPackageJson(projectPath) {
    try {
      const content = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }

  async checkForDatabase(projectPath) {
    try {
      const packageJson = await this.getPackageJson(projectPath);
      if (!packageJson) return false;

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      return Object.keys(deps).some(dep =>
        dep.includes('mongoose') || dep.includes('sequelize') || dep.includes('prisma')
      );
    } catch (e) {
      return false;
    }
  }

  async checkForDocker(projectPath) {
    try {
      await fs.access(path.join(projectPath, 'Dockerfile'));
      return true;
    } catch (e) {
      return false;
    }
  }

  async checkForCI(projectPath) {
    try {
      await fs.access(path.join(projectPath, '.github/workflows'));
      return true;
    } catch (e) {
      return false;
    }
  }

  async checkForTests(projectPath) {
    try {
      const files = await fs.readdir(projectPath);
      return files.some(file => file.includes('test') || file.includes('spec'));
    } catch (e) {
      return false;
    }
  }

  async checkForSecurity(projectPath) {
    try {
      await fs.access(path.join(projectPath, '.env.example'));
      return true;
    } catch (e) {
      return false;
    }
  }

  async analyzeProjectStructure(projectPath) {
    try {
      const files = await fs.readdir(projectPath);
      return {
        hasPackageJson: files.includes('package.json'),
        hasReadme: files.includes('README.md'),
        hasSrc: files.includes('src'),
        hasTests: files.includes('tests') || files.includes('test'),
        hasConfig: files.some(f => f.includes('config'))
      };
    } catch (e) {
      return {};
    }
  }

  hasMongooseInDeps(packageJson) {
    if (!packageJson) return false;
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    return !!deps.mongoose;
  }

  getInstallInstructions(template) {
    const instructions = [];

    if (template.dependencies.length > 0) {
      instructions.push(`Install dependencies: npm install ${template.dependencies.join(' ')}`);
    }

    if (template.devDependencies.length > 0) {
      instructions.push(`Install dev dependencies: npm install --save-dev ${template.devDependencies.join(' ')}`);
    }

    instructions.push('Review and customize the generated files for your specific needs');
    instructions.push('Update your package.json scripts as needed');

    return instructions;
  }

  formatTemplateOutput(suggestions, analysis) {
    if (suggestions.length === 0) {
      return `
🎉 **Your project structure looks complete!**

No additional templates are recommended at this time.
Use \`/suggest-improvements\` for optimization suggestions.
`;
    }

    let output = `
# 📄 Template Suggestions

Based on your **${analysis.framework}** project, here are **${suggestions.length}** recommended templates:

`;

    // Group by category
    const grouped = suggestions.reduce((acc, template) => {
      if (!acc[template.category]) acc[template.category] = [];
      acc[template.category].push(template);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([category, templates]) => {
      output += `## ${this.getCategoryIcon(category)} ${category}\n\n`;

      templates.forEach(template => {
        output += `### 📋 ${template.name}\n`;
        output += `${template.description}\n\n`;
        output += `**Framework:** ${template.framework} | **Category:** ${template.category}\n\n`;

        if (template.dependencies.length > 0) {
          output += `**Dependencies:** ${template.dependencies.join(', ')}\n`;
        }

        if (template.devDependencies.length > 0) {
          output += `**Dev Dependencies:** ${template.devDependencies.join(', ')}\n`;
        }

        output += `\n**Files included:**\n`;
        Object.keys(template.files).forEach(filePath => {
          output += `- \`${filePath}\`\n`;
        });

        output += `\n---\n\n`;
      });
    });

    output += `
## 🚀 Usage

To generate a template:
1. Choose a template from the list above
2. Customize the placeholders ({{ComponentName}}, {{routeName}}, etc.)
3. Review and modify the generated files for your needs

**Next Steps:**
- Use \`/dependency-recommendations\` for package updates
- Use \`/suggest-improvements\` for optimization suggestions
`;

    return output;
  }

  getCategoryIcon(category) {
    const icons = {
      'Component': '🧩',
      'API': '🔌',
      'Database': '🗄️',
      'DevOps': '🔄',
      'Testing': '🧪',
      'Security': '🔒'
    };
    return icons[category] || '📄';
  }
}

module.exports = async function suggestTemplates() {
  const suggester = new ProjectTemplateSuggester();

  try {
    console.log('🔍 Analyzing project for template suggestions...\n');

    const analysis = await suggester.analyzeProject();
    const suggestions = await suggester.suggestTemplates(analysis);
    const formattedOutput = suggester.formatTemplateOutput(suggestions, analysis);

    console.log(formattedOutput);

    return {
      success: true,
      templates: suggestions.length,
      analysis,
      availableTemplates: Array.from(suggester.templates.keys())
    };
  } catch (error) {
    console.error('❌ Error analyzing project for templates:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};