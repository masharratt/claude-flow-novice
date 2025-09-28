/**
 * /suggest-improvements slash command
 * Analyzes project and provides intelligent improvement suggestions
 * Integrates with existing preference system and framework detection
 */

const fs = require('fs').promises;
const path = require('path');

class ProjectImprovementSuggester {
  constructor() {
    this.suggestions = [];
    this.projectType = null;
    this.framework = null;
  }

  async analyzeProject(projectPath = process.cwd()) {
    const analysis = {
      hasTests: await this.checkForTests(projectPath),
      hasCI: await this.checkForCI(projectPath),
      hasDocumentation: await this.checkForDocumentation(projectPath),
      hasLinting: await this.checkForLinting(projectPath),
      hasTypeScript: await this.checkForTypeScript(projectPath),
      hasSecurityConfig: await this.checkForSecurity(projectPath),
      packageJson: await this.analyzePackageJson(projectPath),
      framework: await this.detectFramework(projectPath)
    };

    return analysis;
  }

  async generateSuggestions(analysis) {
    const suggestions = [];

    // Testing suggestions
    if (!analysis.hasTests) {
      suggestions.push({
        category: 'Testing',
        priority: 'High',
        title: 'Add Test Suite',
        description: 'No tests detected. Consider adding unit tests for better code quality.',
        action: analysis.framework === 'react'
          ? 'Install React Testing Library and Jest'
          : analysis.framework === 'node'
          ? 'Install Jest or Vitest for testing'
          : 'Add appropriate testing framework',
        commands: this.getTestingCommands(analysis.framework),
        effort: 'Medium',
        impact: 'High'
      });
    }

    // CI/CD suggestions
    if (!analysis.hasCI) {
      suggestions.push({
        category: 'DevOps',
        priority: 'Medium',
        title: 'Add Continuous Integration',
        description: 'Set up automated testing and deployment pipeline.',
        action: 'Create GitHub Actions workflow for automated testing',
        commands: ['mkdir -p .github/workflows', 'Create ci.yml workflow file'],
        effort: 'Low',
        impact: 'Medium'
      });
    }

    // Documentation suggestions
    if (!analysis.hasDocumentation) {
      suggestions.push({
        category: 'Documentation',
        priority: 'Medium',
        title: 'Improve Documentation',
        description: 'Add or enhance project documentation for better maintainability.',
        action: 'Create comprehensive README and API documentation',
        commands: ['Update README.md', 'Add JSDoc comments', 'Consider documentation site'],
        effort: 'Low',
        impact: 'Medium'
      });
    }

    // Linting suggestions
    if (!analysis.hasLinting) {
      suggestions.push({
        category: 'Code Quality',
        priority: 'Medium',
        title: 'Add Code Linting',
        description: 'Set up linting to maintain consistent code style.',
        action: 'Install and configure ESLint/Prettier',
        commands: this.getLintingCommands(analysis.framework),
        effort: 'Low',
        impact: 'Medium'
      });
    }

    // TypeScript suggestions
    if (!analysis.hasTypeScript && analysis.framework === 'javascript') {
      suggestions.push({
        category: 'Type Safety',
        priority: 'Low',
        title: 'Consider TypeScript Migration',
        description: 'Add type safety to catch errors during development.',
        action: 'Gradual migration to TypeScript',
        commands: ['npm install typescript @types/node', 'Create tsconfig.json', 'Rename .js to .ts files'],
        effort: 'High',
        impact: 'Medium'
      });
    }

    // Security suggestions
    if (!analysis.hasSecurityConfig) {
      suggestions.push({
        category: 'Security',
        priority: 'High',
        title: 'Add Security Configuration',
        description: 'Implement security best practices and vulnerability scanning.',
        action: 'Add security audit and dependency scanning',
        commands: ['npm audit', 'Add .env.example', 'Configure security headers'],
        effort: 'Low',
        impact: 'High'
      });
    }

    // Performance suggestions based on package.json analysis
    if (analysis.packageJson) {
      const perfSuggestions = this.generatePerformanceSuggestions(analysis.packageJson);
      suggestions.push(...perfSuggestions);
    }

    return suggestions;
  }

  async checkForTests(projectPath) {
    const testPaths = [
      'test', 'tests', '__tests__', 'spec',
      'src/test', 'src/tests', 'src/__tests__'
    ];

    for (const testPath of testPaths) {
      try {
        const fullPath = path.join(projectPath, testPath);
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) return true;
      } catch (e) {
        // Directory doesn't exist, continue
      }
    }

    // Check for test files
    try {
      const files = await fs.readdir(projectPath);
      return files.some(file =>
        file.includes('.test.') ||
        file.includes('.spec.') ||
        file.includes('test.js') ||
        file.includes('test.ts')
      );
    } catch (e) {
      return false;
    }
  }

  async checkForCI(projectPath) {
    const ciPaths = [
      '.github/workflows',
      '.gitlab-ci.yml',
      'circle.yml',
      '.circleci',
      'jenkins.yml',
      '.travis.yml'
    ];

    for (const ciPath of ciPaths) {
      try {
        await fs.access(path.join(projectPath, ciPath));
        return true;
      } catch (e) {
        // File/directory doesn't exist, continue
      }
    }
    return false;
  }

  async checkForDocumentation(projectPath) {
    const docFiles = ['README.md', 'docs', 'documentation', 'DOCS.md'];

    for (const docFile of docFiles) {
      try {
        const filePath = path.join(projectPath, docFile);
        const stats = await fs.stat(filePath);
        if (stats.isFile() || stats.isDirectory()) {
          // Check if README is substantial (more than just a title)
          if (docFile === 'README.md') {
            const content = await fs.readFile(filePath, 'utf8');
            return content.length > 100; // More than just a title
          }
          return true;
        }
      } catch (e) {
        // File doesn't exist, continue
      }
    }
    return false;
  }

  async checkForLinting(projectPath) {
    const lintConfigs = [
      '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml',
      '.prettierrc', '.prettierrc.json', '.prettierrc.js',
      'eslint.config.js'
    ];

    for (const config of lintConfigs) {
      try {
        await fs.access(path.join(projectPath, config));
        return true;
      } catch (e) {
        // File doesn't exist, continue
      }
    }

    // Check package.json for linting scripts
    try {
      const packagePath = path.join(projectPath, 'package.json');
      const packageContent = await fs.readFile(packagePath, 'utf8');
      const packageJson = JSON.parse(packageContent);

      if (packageJson.scripts) {
        return Object.keys(packageJson.scripts).some(script =>
          script.includes('lint') || script.includes('format')
        );
      }
    } catch (e) {
      // package.json doesn't exist or is invalid
    }

    return false;
  }

  async checkForTypeScript(projectPath) {
    try {
      await fs.access(path.join(projectPath, 'tsconfig.json'));
      return true;
    } catch (e) {
      // Check for .ts files
      try {
        const files = await fs.readdir(projectPath);
        return files.some(file => file.endsWith('.ts') || file.endsWith('.tsx'));
      } catch (e) {
        return false;
      }
    }
  }

  async checkForSecurity(projectPath) {
    const securityFiles = [
      '.env.example', 'SECURITY.md', '.nvmrc',
      '.node-version', 'security.yml'
    ];

    for (const file of securityFiles) {
      try {
        await fs.access(path.join(projectPath, file));
        return true;
      } catch (e) {
        // File doesn't exist, continue
      }
    }
    return false;
  }

  async analyzePackageJson(projectPath) {
    try {
      const packagePath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packagePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }

  async detectFramework(projectPath) {
    try {
      const packageJson = await this.analyzePackageJson(projectPath);
      if (!packageJson) return 'unknown';

      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      if (dependencies.react) return 'react';
      if (dependencies.vue) return 'vue';
      if (dependencies.angular || dependencies['@angular/core']) return 'angular';
      if (dependencies.express) return 'express';
      if (dependencies.next) return 'nextjs';
      if (dependencies.nuxt) return 'nuxt';
      if (dependencies.svelte) return 'svelte';

      return 'node';
    } catch (e) {
      return 'unknown';
    }
  }

  getTestingCommands(framework) {
    switch (framework) {
      case 'react':
        return [
          'npm install --save-dev @testing-library/react @testing-library/jest-dom',
          'Create src/components/__tests__ directory',
          'Add test scripts to package.json'
        ];
      case 'vue':
        return [
          'npm install --save-dev @vue/test-utils jest',
          'Create tests/unit directory',
          'Configure Jest for Vue components'
        ];
      case 'express':
      case 'node':
        return [
          'npm install --save-dev jest supertest',
          'Create tests directory',
          'Add test scripts to package.json'
        ];
      default:
        return [
          'npm install --save-dev jest',
          'Create tests directory',
          'Add test configuration'
        ];
    }
  }

  getLintingCommands(framework) {
    switch (framework) {
      case 'react':
        return [
          'npm install --save-dev eslint @eslint/js eslint-plugin-react',
          'npm install --save-dev prettier eslint-config-prettier',
          'Create .eslintrc.json and .prettierrc'
        ];
      case 'vue':
        return [
          'npm install --save-dev eslint eslint-plugin-vue',
          'npm install --save-dev prettier eslint-config-prettier',
          'Create .eslintrc.json configuration'
        ];
      default:
        return [
          'npm install --save-dev eslint @eslint/js',
          'npm install --save-dev prettier eslint-config-prettier',
          'Run npx eslint --init for setup'
        ];
    }
  }

  generatePerformanceSuggestions(packageJson) {
    const suggestions = [];

    // Check for outdated dependencies
    if (packageJson.dependencies) {
      // This is a simplified check - in practice you'd want to check against a registry
      const largeDependencies = ['lodash', 'moment', 'jquery'];
      const foundLarge = Object.keys(packageJson.dependencies).filter(dep =>
        largeDependencies.includes(dep)
      );

      if (foundLarge.length > 0) {
        suggestions.push({
          category: 'Performance',
          priority: 'Medium',
          title: 'Optimize Bundle Size',
          description: `Consider alternatives to large dependencies: ${foundLarge.join(', ')}`,
          action: 'Replace with smaller alternatives or use tree-shaking',
          commands: foundLarge.map(dep => `Consider replacing ${dep} with lighter alternative`),
          effort: 'Medium',
          impact: 'Medium'
        });
      }
    }

    return suggestions;
  }

  formatSuggestions(suggestions) {
    if (suggestions.length === 0) {
      return `
🎉 **Great job!** Your project follows most best practices.

Consider running \`/dependency-recommendations\` to check for updates.
`;
    }

    let output = `
# 📊 Project Improvement Suggestions

Found **${suggestions.length}** recommendations to enhance your project:

`;

    // Group by category
    const grouped = suggestions.reduce((acc, suggestion) => {
      if (!acc[suggestion.category]) acc[suggestion.category] = [];
      acc[suggestion.category].push(suggestion);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([category, items]) => {
      output += `## ${this.getCategoryIcon(category)} ${category}\n\n`;

      items.forEach(suggestion => {
        const priorityIcon = this.getPriorityIcon(suggestion.priority);
        output += `### ${priorityIcon} ${suggestion.title}\n`;
        output += `**Priority:** ${suggestion.priority} | **Effort:** ${suggestion.effort} | **Impact:** ${suggestion.impact}\n\n`;
        output += `${suggestion.description}\n\n`;
        output += `**Action:** ${suggestion.action}\n\n`;

        if (suggestion.commands && suggestion.commands.length > 0) {
          output += `**Commands:**\n`;
          suggestion.commands.forEach(cmd => {
            output += `- \`${cmd}\`\n`;
          });
        }
        output += `\n---\n\n`;
      });
    });

    output += `
## 🎯 Quick Actions

**High Priority Items:** ${suggestions.filter(s => s.priority === 'High').length}
**Medium Priority Items:** ${suggestions.filter(s => s.priority === 'Medium').length}
**Low Priority Items:** ${suggestions.filter(s => s.priority === 'Low').length}

**Next Steps:**
1. Start with High priority items
2. Use \`/suggest-templates\` for implementation templates
3. Run \`/dependency-recommendations\` for package updates
`;

    return output;
  }

  getCategoryIcon(category) {
    const icons = {
      'Testing': '🧪',
      'DevOps': '🔄',
      'Documentation': '📚',
      'Code Quality': '✨',
      'Type Safety': '🛡️',
      'Security': '🔒',
      'Performance': '⚡'
    };
    return icons[category] || '📋';
  }

  getPriorityIcon(priority) {
    const icons = {
      'High': '🔴',
      'Medium': '🟡',
      'Low': '🟢'
    };
    return icons[priority] || '⚪';
  }
}

module.exports = async function suggestImprovements() {
  const suggester = new ProjectImprovementSuggester();

  try {
    console.log('🔍 Analyzing your project for improvements...\n');

    const analysis = await suggester.analyzeProject();
    const suggestions = await suggester.generateSuggestions(analysis);
    const formattedOutput = suggester.formatSuggestions(suggestions);

    console.log(formattedOutput);

    return {
      success: true,
      suggestions: suggestions.length,
      analysis
    };
  } catch (error) {
    console.error('❌ Error analyzing project:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};