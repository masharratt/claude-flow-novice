import fs from 'fs/promises';
import path from 'path';
import { LanguageDetector } from './language-detector.js';

/**
 * CLAUDE.md Generator System
 *
 * Auto-generates CLAUDE.md files with language-specific best practices
 * Uses templates and intelligent substitution for contextual configurations
 */
export class ClaudeMdGenerator {
  constructor(projectPath = process.cwd(), options = {}) {
    this.projectPath = projectPath;
    this.options = {
      preserveCustomSections: true,
      backupExisting: true,
      templatePath: options.templatePath || path.join(process.cwd(), 'src', 'templates', 'claude-md-templates'),
      preferencesPath: options.preferencesPath || path.join(process.cwd(), '.claude-flow-novice', 'preferences'),
      ...options
    };

    this.detector = new LanguageDetector(projectPath);
    this.detectionResults = null;
    this.templates = {};
    this.userPreferences = {};
  }

  /**
   * Main generation method
   */
  async generateClaudeMd() {
    console.log('🚀 Starting CLAUDE.md generation...');

    try {
      // Step 1: Detect project languages and frameworks
      this.detectionResults = await this.detector.detectProject();
      console.log(`✅ Detected primary type: ${this.detectionResults.projectType}`);

      // Step 2: Load templates and user preferences
      await Promise.all([
        this.loadTemplates(),
        this.loadUserPreferences()
      ]);

      // Step 3: Check for existing CLAUDE.md
      const existingContent = await this.loadExistingClaudeMd();

      // Step 4: Generate new content
      const newContent = await this.generateContent();

      // Step 5: Merge with existing if needed
      const finalContent = existingContent
        ? await this.mergeWithExisting(existingContent, newContent)
        : newContent;

      // Step 6: Write the file
      await this.writeClaudeMd(finalContent);

      console.log('✅ CLAUDE.md generation completed successfully');
      return finalContent;

    } catch (error) {
      console.error(`❌ Generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load all template files
   */
  async loadTemplates() {
    const templateFiles = [
      'base-template.md',
      'javascript-template.md',
      'typescript-template.md',
      'python-template.md',
      'react-template.md',
      'express-template.md',
      'django-template.md',
      'flask-template.md',
      'nextjs-template.md'
    ];

    for (const template of templateFiles) {
      const templatePath = path.join(this.options.templatePath, template);
      try {
        const content = await fs.readFile(templatePath, 'utf8');
        const name = template.replace('-template.md', '');
        this.templates[name] = content;
      } catch (error) {
        console.warn(`Template ${template} not found, skipping...`);
      }
    }

    console.log(`📄 Loaded ${Object.keys(this.templates).length} templates`);
  }

  /**
   * Load user preferences and language configs
   */
  async loadUserPreferences() {
    try {
      const prefsPath = path.join(this.options.preferencesPath, 'generation.json');
      const content = await fs.readFile(prefsPath, 'utf8');
      this.userPreferences = JSON.parse(content);
    } catch (error) {
      // Use defaults if no preferences found
      this.userPreferences = {
        autoGenerate: true,
        includeFrameworkSpecific: true,
        includeBestPractices: true,
        includeTestingPatterns: true,
        includeDeploymentGuidelines: false
      };
    }

    console.log('⚙️ User preferences loaded');
  }

  /**
   * Load existing CLAUDE.md if it exists
   */
  async loadExistingClaudeMd() {
    const claudeMdPath = path.join(this.projectPath, 'CLAUDE.md');

    try {
      const content = await fs.readFile(claudeMdPath, 'utf8');

      // Create backup if requested
      if (this.options.backupExisting) {
        const backupPath = claudeMdPath + `.backup.${Date.now()}`;
        await fs.writeFile(backupPath, content);
        console.log(`📋 Created backup: ${path.basename(backupPath)}`);
      }

      return content;
    } catch (error) {
      console.log('📝 No existing CLAUDE.md found, creating new one');
      return null;
    }
  }

  /**
   * Generate new CLAUDE.md content based on detection results
   */
  async generateContent() {
    const { projectType, languages, frameworks, metadata } = this.detectionResults;

    // Start with base template
    let content = this.templates.base || this.getDefaultBaseTemplate();

    // Apply template substitutions
    const substitutions = this.buildSubstitutions();
    content = this.applySubstitutions(content, substitutions);

    // Add language-specific sections
    content = await this.addLanguageSpecificSections(content);

    // Add framework-specific sections
    content = await this.addFrameworkSpecificSections(content);

    // Add concurrent execution patterns
    content = await this.addConcurrentExecutionPatterns(content);

    // Add best practices
    if (this.userPreferences.includeBestPractices) {
      content = await this.addBestPractices(content);
    }

    // Add testing patterns
    if (this.userPreferences.includeTestingPatterns) {
      content = await this.addTestingPatterns(content);
    }

    return content;
  }

  /**
   * Build template substitution variables
   */
  buildSubstitutions() {
    const { projectType, languages, frameworks, metadata } = this.detectionResults;

    return {
      PROJECT_TYPE: projectType || 'unknown',
      PRIMARY_LANGUAGE: metadata.primaryLanguage || 'javascript',
      PRIMARY_FRAMEWORK: metadata.primaryFramework || 'none',
      PROJECT_NAME: metadata.projectName || path.basename(this.projectPath),
      PACKAGE_MANAGER: metadata.packageManager || 'npm',
      BUILD_TOOLS: Object.keys(metadata.buildTools || {}).join(', ') || 'none',
      LANGUAGES_LIST: Object.keys(languages).join(', '),
      FRAMEWORKS_LIST: Object.keys(frameworks).join(', '),
      TIMESTAMP: new Date().toISOString().split('T')[0],
      DIRECTORIES: (metadata.directories || []).join(', ')
    };
  }

  /**
   * Apply template variable substitutions
   */
  applySubstitutions(content, substitutions) {
    let result = content;

    for (const [key, value] = Object.entries(substitutions)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, value);
    }

    return result;
  }

  /**
   * Add language-specific sections
   */
  async addLanguageSpecificSections(content) {
    const { languages } = this.detectionResults;
    let result = content;

    for (const [language, confidence] of Object.entries(languages)) {
      if (confidence > 0.3 && this.templates[language]) {
        const languageSection = `\n\n## ${language.charAt(0).toUpperCase() + language.slice(1)} Configuration\n\n`;
        result += languageSection + this.templates[language];
      }
    }

    return result;
  }

  /**
   * Add framework-specific sections
   */
  async addFrameworkSpecificSections(content) {
    const { frameworks } = this.detectionResults;
    let result = content;

    for (const [framework, confidence] of Object.entries(frameworks)) {
      if (confidence > 0.4 && this.templates[framework]) {
        const frameworkSection = `\n\n## ${framework.charAt(0).toUpperCase() + framework.slice(1)} Framework Configuration\n\n`;
        result += frameworkSection + this.templates[framework];
      }
    }

    return result;
  }

  /**
   * Add concurrent execution patterns based on detected languages
   */
  async addConcurrentExecutionPatterns(content) {
    const { languages, frameworks } = this.detectionResults;
    let patterns = '\n\n## 🚀 Concurrent Execution Patterns\n\n';

    // JavaScript/TypeScript patterns
    if (languages.javascript || languages.typescript) {
      patterns += this.getJavaScriptConcurrentPatterns();
    }

    // Python patterns
    if (languages.python) {
      patterns += this.getPythonConcurrentPatterns();
    }

    // React patterns
    if (frameworks.react || frameworks.nextjs) {
      patterns += this.getReactConcurrentPatterns();
    }

    // API patterns
    if (frameworks.express || frameworks.flask || frameworks.django || frameworks.fastapi) {
      patterns += this.getApiConcurrentPatterns();
    }

    return content + patterns;
  }

  /**
   * Add best practices section
   */
  async addBestPractices(content) {
    const { projectType, languages, frameworks } = this.detectionResults;
    let practices = '\n\n## 📋 Best Practices\n\n';

    // General practices
    practices += `### General Development\n`;
    practices += `- **Modular Design**: Keep files under 500 lines\n`;
    practices += `- **Environment Safety**: Never hardcode secrets\n`;
    practices += `- **Test-First**: Write tests before implementation\n`;
    practices += `- **Clean Architecture**: Separate concerns\n`;
    practices += `- **Documentation**: Keep updated\n\n`;

    // Language-specific practices
    if (languages.javascript || languages.typescript) {
      practices += this.getJavaScriptBestPractices();
    }

    if (languages.python) {
      practices += this.getPythonBestPractices();
    }

    return content + practices;
  }

  /**
   * Add testing patterns section
   */
  async addTestingPatterns(content) {
    const { languages, frameworks } = this.detectionResults;
    let testing = '\n\n## 🧪 Testing Patterns\n\n';

    if (languages.javascript || languages.typescript) {
      if (frameworks.react || frameworks.nextjs) {
        testing += this.getReactTestingPatterns();
      } else {
        testing += this.getJavaScriptTestingPatterns();
      }
    }

    if (languages.python) {
      testing += this.getPythonTestingPatterns();
    }

    return content + testing;
  }

  /**
   * Merge new content with existing CLAUDE.md
   */
  async mergeWithExisting(existing, generated) {
    console.log('🔄 Merging with existing CLAUDE.md...');

    // Extract custom sections from existing file
    const customSections = this.extractCustomSections(existing);

    // Combine generated content with preserved custom sections
    let merged = generated;

    if (customSections.length > 0) {
      merged += '\n\n## Custom Configuration\n\n';
      merged += '<!-- Preserved from existing CLAUDE.md -->\n';
      merged += customSections.join('\n\n');
    }

    return merged;
  }

  /**
   * Extract custom sections that should be preserved
   */
  extractCustomSections(content) {
    const customSections = [];
    const lines = content.split('\n');
    let inCustomSection = false;
    let currentSection = [];

    for (const line of lines) {
      // Look for custom markers or sections not in our templates
      if (line.includes('<!-- CUSTOM') || line.includes('# Custom') || line.includes('## Custom')) {
        inCustomSection = true;
        currentSection = [line];
      } else if (inCustomSection && line.startsWith('#')) {
        // End of custom section
        customSections.push(currentSection.join('\n'));
        inCustomSection = false;
        currentSection = [];
      } else if (inCustomSection) {
        currentSection.push(line);
      }
    }

    // Add final section if we ended in a custom section
    if (currentSection.length > 0) {
      customSections.push(currentSection.join('\n'));
    }

    return customSections;
  }

  /**
   * Write the final CLAUDE.md file
   */
  async writeClaudeMd(content) {
    const claudeMdPath = path.join(this.projectPath, 'CLAUDE.md');
    await fs.writeFile(claudeMdPath, content);
    console.log(`📄 Written CLAUDE.md (${content.length} characters)`);
  }

  // Template pattern methods
  getJavaScriptConcurrentPatterns() {
    return `### JavaScript/TypeScript Patterns\n\n` +
      `\`\`\`javascript\n` +
      `// ✅ CORRECT: Batch all operations in single message\n` +
      `[Single Message]:\n` +
      `  Task("Frontend Developer", "Build React components with hooks", "coder")\n` +
      `  Task("Backend Developer", "Create Express API endpoints", "backend-dev")\n` +
      `  Task("Test Engineer", "Write Jest tests with >80% coverage", "tester")\n` +
      `  \n` +
      `  // Batch file operations\n` +
      `  Write("src/components/App.jsx")\n` +
      `  Write("src/api/server.js")\n` +
      `  Write("tests/App.test.js")\n` +
      `\`\`\`\n\n`;
  }

  getPythonConcurrentPatterns() {
    return `### Python Patterns\n\n` +
      `\`\`\`python\n` +
      `# ✅ CORRECT: Parallel agent execution\n` +
      `[Single Message]:\n` +
      `  Task("Django Developer", "Build models and views with DRF", "backend-dev")\n` +
      `  Task("Frontend Developer", "Create React frontend with API integration", "coder")\n` +
      `  Task("Test Engineer", "Write pytest tests with fixtures", "tester")\n` +
      `  \n` +
      `  # Batch Python operations\n` +
      `  Write("apps/models.py")\n` +
      `  Write("apps/views.py")\n` +
      `  Write("tests/test_models.py")\n` +
      `\`\`\`\n\n`;
  }

  getReactConcurrentPatterns() {
    return `### React Development Patterns\n\n` +
      `\`\`\`javascript\n` +
      `// React-specific concurrent patterns\n` +
      `[Single Message]:\n` +
      `  Task("Component Developer", "Build reusable components with TypeScript", "coder")\n` +
      `  Task("State Manager", "Implement Redux/Context state management", "coder")\n` +
      `  Task("Test Engineer", "Write React Testing Library tests", "tester")\n` +
      `  Task("Style Developer", "Create responsive CSS/Styled Components", "coder")\n` +
      `\`\`\`\n\n`;
  }

  getApiConcurrentPatterns() {
    return `### API Development Patterns\n\n` +
      `\`\`\`bash\n` +
      `# API-focused concurrent execution\n` +
      `[Single Message]:\n` +
      `  Task("API Developer", "Build RESTful endpoints with validation", "backend-dev")\n` +
      `  Task("Database Designer", "Design schema and migrations", "code-analyzer")\n` +
      `  Task("Security Engineer", "Implement authentication and authorization", "reviewer")\n` +
      `  Task("API Tester", "Create integration and unit tests", "tester")\n` +
      `  Task("Documentation Writer", "Generate OpenAPI/Swagger docs", "researcher")\n` +
      `\`\`\`\n\n`;
  }

  getJavaScriptBestPractices() {
    return `### JavaScript/TypeScript\n` +
      `- **ES6+ Features**: Use modern JavaScript syntax\n` +
      `- **Type Safety**: Prefer TypeScript for larger projects\n` +
      `- **Async/Await**: Use async/await over Promise chains\n` +
      `- **Error Handling**: Implement proper error boundaries\n` +
      `- **Code Splitting**: Lazy load components and routes\n\n`;
  }

  getPythonBestPractices() {
    return `### Python\n` +
      `- **PEP 8**: Follow Python style guidelines\n` +
      `- **Type Hints**: Use type annotations for clarity\n` +
      `- **Virtual Environments**: Always use venv or conda\n` +
      `- **Docstrings**: Document all functions and classes\n` +
      `- **Error Handling**: Use specific exception types\n\n`;
  }

  getReactTestingPatterns() {
    return `### React Testing\n\n` +
      `\`\`\`javascript\n` +
      `import { render, screen, fireEvent } from '@testing-library/react';\n` +
      `import userEvent from '@testing-library/user-event';\n` +
      `\n` +
      `// Component testing pattern\n` +
      `describe('Component', () => {\n` +
      `  test('renders and handles interaction', async () => {\n` +
      `    const user = userEvent.setup();\n` +
      `    render(<Component />);\n` +
      `    \n` +
      `    const button = screen.getByRole('button');\n` +
      `    await user.click(button);\n` +
      `    \n` +
      `    expect(screen.getByText(/result/i)).toBeInTheDocument();\n` +
      `  });\n` +
      `});\n` +
      `\`\`\`\n\n`;
  }

  getJavaScriptTestingPatterns() {
    return `### JavaScript Testing\n\n` +
      `\`\`\`javascript\n` +
      `// Jest testing patterns\n` +
      `describe('API Module', () => {\n` +
      `  beforeEach(() => {\n` +
      `    jest.clearAllMocks();\n` +
      `  });\n` +
      `\n` +
      `  test('handles async operations', async () => {\n` +
      `    const result = await apiCall();\n` +
      `    expect(result).toEqual(expectedResult);\n` +
      `  });\n` +
      `});\n` +
      `\`\`\`\n\n`;
  }

  getPythonTestingPatterns() {
    return `### Python Testing\n\n` +
      `\`\`\`python\n` +
      `import pytest\n` +
      `from unittest.mock import patch, MagicMock\n` +
      `\n` +
      `class TestAPI:\n` +
      `    @pytest.fixture\n` +
      `    def client(self):\n` +
      `        return TestClient()\n` +
      `\n` +
      `    def test_endpoint(self, client):\n` +
      `        response = client.get("/api/endpoint")\n` +
      `        assert response.status_code == 200\n` +
      `        assert response.json()["status"] == "success"\n` +
      `\`\`\`\n\n`;
  }

  /**
   * Default base template if none is provided
   */
  getDefaultBaseTemplate() {
    return `# Claude Code Configuration - {{PROJECT_TYPE}} Development Environment

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently, not just MCP

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

## Project Overview

**Project Type**: {{PROJECT_TYPE}}
**Primary Language**: {{PRIMARY_LANGUAGE}}
**Primary Framework**: {{PRIMARY_FRAMEWORK}}
**Package Manager**: {{PACKAGE_MANAGER}}
**Build Tools**: {{BUILD_TOOLS}}

**Detected Languages**: {{LANGUAGES_LIST}}
**Detected Frameworks**: {{FRAMEWORKS_LIST}}

*Auto-generated on {{TIMESTAMP}}*

## File Organization Rules

**NEVER save to root folder. Use these directories:**
- \`/src\` - Source code files
- \`/tests\` - Test files
- \`/docs\` - Documentation and markdown files
- \`/config\` - Configuration files
- \`/scripts\` - Utility scripts
- \`/examples\` - Example code
`;
  }

  /**
   * Save generation preferences
   */
  async savePreferences(preferences) {
    const prefsDir = path.join(this.options.preferencesPath);
    const prefsFile = path.join(prefsDir, 'generation.json');

    // Ensure directory exists
    await fs.mkdir(prefsDir, { recursive: true });

    // Merge with existing preferences
    const updatedPrefs = { ...this.userPreferences, ...preferences };
    await fs.writeFile(prefsFile, JSON.stringify(updatedPrefs, null, 2));

    this.userPreferences = updatedPrefs;
    console.log('⚙️ Preferences saved');
  }

  /**
   * Update CLAUDE.md for specific language/framework addition
   */
  async updateForNewTechnology(technology, type = 'framework') {
    console.log(`🔄 Updating CLAUDE.md for new ${type}: ${technology}`);

    // Re-detect to get updated information
    this.detectionResults = await this.detector.detectProject();

    // Load existing content
    const existing = await this.loadExistingClaudeMd();
    if (!existing) {
      return this.generateClaudeMd();
    }

    // Generate new sections for the technology
    let newSection = '';
    if (type === 'framework' && this.templates[technology]) {
      newSection = `\n\n## ${technology.charAt(0).toUpperCase() + technology.slice(1)} Framework Configuration\n\n`;
      newSection += this.templates[technology];
    } else if (type === 'language' && this.templates[technology]) {
      newSection = `\n\n## ${technology.charAt(0).toUpperCase() + technology.slice(1)} Configuration\n\n`;
      newSection += this.templates[technology];
    }

    if (newSection) {
      const updatedContent = existing + newSection;
      await this.writeClaudeMd(updatedContent);
      console.log(`✅ Added ${technology} section to CLAUDE.md`);
    }
  }
}

export default ClaudeMdGenerator;