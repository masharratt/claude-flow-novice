import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

/**
 * Language Detection System
 *
 * Scans project files to detect programming languages, frameworks, and dependencies
 * Provides confidence scoring and detailed analysis for CLAUDE.md generation
 */
export class LanguageDetector {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.detectionResults = {
      languages: {},
      frameworks: {},
      dependencies: {},
      projectType: null,
      confidence: 0,
      metadata: {}
    };

    // Language patterns and scoring weights
    this.languagePatterns = {
      javascript: {
        extensions: ['.js', '.mjs', '.cjs'],
        files: ['package.json', '.eslintrc*', 'babel.config.*'],
        patterns: [/require\(/, /import\s+.*from/, /module\.exports/, /export\s+(default\s+)?/],
        weight: 1.0
      },
      typescript: {
        extensions: ['.ts', '.tsx'],
        files: ['tsconfig.json', 'tslint.json', '.tsconfig.json'],
        patterns: [/interface\s+\w+/, /type\s+\w+\s*=/, /:\s*\w+(\[\])?/, /import.*from.*\.ts/],
        weight: 1.2
      },
      python: {
        extensions: ['.py', '.pyx', '.pyw'],
        files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', '__init__.py'],
        patterns: [/def\s+\w+\s*\(/, /import\s+\w+/, /from\s+\w+\s+import/, /class\s+\w+/],
        weight: 1.0
      },
      java: {
        extensions: ['.java'],
        files: ['pom.xml', 'build.gradle', '.gradle'],
        patterns: [/public\s+class/, /package\s+[\w.]+/, /import\s+[\w.]+/],
        weight: 1.0
      },
      go: {
        extensions: ['.go'],
        files: ['go.mod', 'go.sum'],
        patterns: [/package\s+main/, /func\s+\w+/, /import\s*\(/, /var\s+\w+\s+\w+/],
        weight: 1.0
      },
      rust: {
        extensions: ['.rs'],
        files: ['Cargo.toml', 'Cargo.lock'],
        patterns: [/fn\s+\w+/, /struct\s+\w+/, /impl\s+\w+/, /use\s+[\w:]+/],
        weight: 1.0
      }
    };

    // Framework detection patterns
    this.frameworkPatterns = {
      react: {
        dependencies: ['react', '@types/react', 'react-dom'],
        patterns: [/import.*React/, /from\s+['"]react['"]/, /jsx?/, /\.tsx?$/],
        files: ['.babelrc', 'next.config.js'],
        weight: 1.5
      },
      nextjs: {
        dependencies: ['next'],
        patterns: [/from\s+['"]next\//, /export.*getServerSideProps/, /export.*getStaticProps/],
        files: ['next.config.js', 'pages/', 'app/'],
        weight: 1.8
      },
      vue: {
        dependencies: ['vue', '@vue/cli'],
        patterns: [/import.*Vue/, /<template>/, /<script>/, /\.vue$/],
        files: ['vue.config.js'],
        weight: 1.5
      },
      angular: {
        dependencies: ['@angular/core', '@angular/cli'],
        patterns: [/import.*@angular/, /@Component/, /@Injectable/, /\.component\.ts$/],
        files: ['angular.json', '.angular-cli.json'],
        weight: 1.5
      },
      express: {
        dependencies: ['express'],
        patterns: [/require\(['"]express['"]/, /app\.get/, /app\.post/, /app\.listen/],
        files: [],
        weight: 1.3
      },
      fastify: {
        dependencies: ['fastify'],
        patterns: [/require\(['"]fastify['"]/, /fastify\.register/, /fastify\.listen/],
        files: [],
        weight: 1.3
      },
      django: {
        dependencies: ['django'],
        patterns: [/from\s+django/, /django\./, /INSTALLED_APPS/, /urls\.py$/],
        files: ['manage.py', 'settings.py', 'wsgi.py'],
        weight: 1.5
      },
      flask: {
        dependencies: ['flask'],
        patterns: [/from\s+flask/, /Flask\(__name__\)/, /app\.route/, /@app\.route/],
        files: ['app.py', 'wsgi.py'],
        weight: 1.3
      },
      fastapi: {
        dependencies: ['fastapi'],
        patterns: [/from\s+fastapi/, /FastAPI\(\)/, /@app\.get/, /@app\.post/],
        files: ['main.py'],
        weight: 1.4
      },
      spring: {
        dependencies: ['spring-boot-starter'],
        patterns: [/@SpringBootApplication/, /@RestController/, /@Service/],
        files: ['application.properties', 'application.yml'],
        weight: 1.5
      }
    };
  }

  /**
   * Main detection method - analyzes the entire project
   */
  async detectProject() {
    console.log(`🔍 Scanning project at: ${this.projectPath}`);

    try {
      // Parallel detection for better performance
      await Promise.all([
        this.scanPackageFiles(),
        this.scanSourceFiles(),
        this.analyzeProjectStructure(),
        this.detectBuildTools()
      ]);

      // Calculate confidence scores
      this.calculateConfidenceScores();

      // Determine primary project type
      this.determinePrimaryProjectType();

      console.log(`✅ Detection complete. Found ${Object.keys(this.detectionResults.languages).length} languages`);
      return this.detectionResults;

    } catch (error) {
      console.error(`❌ Detection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scan package management files (package.json, requirements.txt, etc.)
   */
  async scanPackageFiles() {
    const packageFiles = [
      'package.json',
      'requirements.txt',
      'pyproject.toml',
      'Pipfile',
      'pom.xml',
      'build.gradle',
      'Cargo.toml',
      'go.mod'
    ];

    for (const file of packageFiles) {
      const filePath = path.join(this.projectPath, file);

      try {
        const content = await fs.readFile(filePath, 'utf8');
        await this.analyzePackageFile(file, content);
      } catch (error) {
        // File doesn't exist, continue
        continue;
      }
    }
  }

  /**
   * Analyze specific package files for dependencies and metadata
   */
  async analyzePackageFile(filename, content) {
    switch (filename) {
      case 'package.json':
        await this.analyzePackageJson(content);
        break;
      case 'requirements.txt':
        await this.analyzeRequirementsTxt(content);
        break;
      case 'pyproject.toml':
        await this.analyzePyprojectToml(content);
        break;
      case 'pom.xml':
        await this.analyzePomXml(content);
        break;
      case 'Cargo.toml':
        await this.analyzeCargoToml(content);
        break;
      case 'go.mod':
        await this.analyzeGoMod(content);
        break;
    }
  }

  async analyzePackageJson(content) {
    try {
      const pkg = JSON.parse(content);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies
      };

      // Detect JavaScript/TypeScript
      this.incrementLanguageScore('javascript', 0.8);

      if (allDeps.typescript || allDeps['@types/node']) {
        this.incrementLanguageScore('typescript', 1.2);
      }

      // Detect frameworks
      for (const [framework, config] of Object.entries(this.frameworkPatterns)) {
        const hasFramework = config.dependencies.some(dep =>
          Object.keys(allDeps).some(installedDep =>
            installedDep.includes(dep) || dep.includes(installedDep)
          )
        );

        if (hasFramework) {
          this.incrementFrameworkScore(framework, config.weight);
        }
      }

      // Store metadata
      this.detectionResults.metadata.packageManager = 'npm';
      this.detectionResults.metadata.projectName = pkg.name;
      this.detectionResults.metadata.scripts = pkg.scripts || {};
      this.detectionResults.dependencies = { ...this.detectionResults.dependencies, ...allDeps };

    } catch (error) {
      console.warn(`Failed to parse package.json: ${error.message}`);
    }
  }

  async analyzeRequirementsTxt(content) {
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    this.incrementLanguageScore('python', 0.9);
    this.detectionResults.metadata.packageManager = 'pip';

    // Extract package names and detect frameworks
    for (const line of lines) {
      const packageName = line.split(/[>=<~!]/)[0].toLowerCase().trim();
      this.detectionResults.dependencies[packageName] = line;

      // Check for Python frameworks
      for (const [framework, config] of Object.entries(this.frameworkPatterns)) {
        if (config.dependencies.some(dep => packageName.includes(dep.toLowerCase()))) {
          this.incrementFrameworkScore(framework, config.weight);
        }
      }
    }
  }

  async analyzePyprojectToml(content) {
    this.incrementLanguageScore('python', 0.8);
    this.detectionResults.metadata.packageManager = 'poetry';

    // Basic TOML parsing for dependencies
    const depMatches = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/);
    if (depMatches) {
      const depSection = depMatches[1];
      const deps = depSection.match(/^(\w+)\s*=/gm);
      if (deps) {
        deps.forEach(dep => {
          const name = dep.split('=')[0].trim();
          this.detectionResults.dependencies[name] = dep;
        });
      }
    }
  }

  async analyzePomXml(content) {
    this.incrementLanguageScore('java', 1.0);
    this.detectionResults.metadata.packageManager = 'maven';

    // Extract Spring Boot detection
    if (content.includes('spring-boot')) {
      this.incrementFrameworkScore('spring', 1.5);
    }
  }

  async analyzeCargoToml(content) {
    this.incrementLanguageScore('rust', 1.0);
    this.detectionResults.metadata.packageManager = 'cargo';
  }

  async analyzeGoMod(content) {
    this.incrementLanguageScore('go', 1.0);
    this.detectionResults.metadata.packageManager = 'go';
  }

  /**
   * Scan source files for language patterns
   */
  async scanSourceFiles() {
    const sourceFiles = await glob('**/*.{js,ts,tsx,jsx,py,java,go,rs,vue}', {
      cwd: this.projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'vendor/**', 'target/**']
    });

    console.log(`📁 Found ${sourceFiles.length} source files to analyze`);

    // Process files in batches for performance
    const batchSize = 50;
    for (let i = 0; i < sourceFiles.length; i += batchSize) {
      const batch = sourceFiles.slice(i, i + batchSize);
      await Promise.all(batch.map(file => this.analyzeSourceFile(file)));
    }
  }

  /**
   * Analyze individual source file
   */
  async analyzeSourceFile(relativePath) {
    const filePath = path.join(this.projectPath, relativePath);
    const ext = path.extname(relativePath);

    try {
      const content = await fs.readFile(filePath, 'utf8');

      // Detect language by extension
      for (const [lang, config] of Object.entries(this.languagePatterns)) {
        if (config.extensions.includes(ext)) {
          this.incrementLanguageScore(lang, 0.5);

          // Check for language-specific patterns
          config.patterns.forEach(pattern => {
            if (pattern.test(content)) {
              this.incrementLanguageScore(lang, 0.3);
            }
          });
        }
      }

      // Check for framework patterns
      for (const [framework, config] of Object.entries(this.frameworkPatterns)) {
        config.patterns.forEach(pattern => {
          if (pattern.test(content) || pattern.test(relativePath)) {
            this.incrementFrameworkScore(framework, 0.4);
          }
        });
      }

    } catch (error) {
      console.warn(`Could not analyze ${relativePath}: ${error.message}`);
    }
  }

  /**
   * Analyze project structure for additional clues
   */
  async analyzeProjectStructure() {
    const directories = ['src', 'lib', 'app', 'pages', 'components', 'views', 'models', 'controllers', 'routes'];

    for (const dir of directories) {
      const dirPath = path.join(this.projectPath, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          this.detectionResults.metadata.directories = this.detectionResults.metadata.directories || [];
          this.detectionResults.metadata.directories.push(dir);

          // Specific directory patterns
          if (dir === 'pages' || dir === 'app') {
            this.incrementFrameworkScore('nextjs', 0.5);
          }
          if (dir === 'components') {
            this.incrementFrameworkScore('react', 0.3);
            this.incrementFrameworkScore('vue', 0.3);
          }
        }
      } catch (error) {
        // Directory doesn't exist
        continue;
      }
    }
  }

  /**
   * Detect build tools and configuration files
   */
  async detectBuildTools() {
    const buildFiles = {
      'webpack.config.js': { tool: 'webpack', score: 0.5 },
      'vite.config.js': { tool: 'vite', score: 0.5 },
      'rollup.config.js': { tool: 'rollup', score: 0.5 },
      'gulpfile.js': { tool: 'gulp', score: 0.5 },
      'Makefile': { tool: 'make', score: 0.5 },
      'docker-compose.yml': { tool: 'docker', score: 0.7 },
      'Dockerfile': { tool: 'docker', score: 0.7 }
    };

    for (const [file, config] of Object.entries(buildFiles)) {
      try {
        await fs.access(path.join(this.projectPath, file));
        this.detectionResults.metadata.buildTools = this.detectionResults.metadata.buildTools || {};
        this.detectionResults.metadata.buildTools[config.tool] = config.score;
      } catch (error) {
        // File doesn't exist
        continue;
      }
    }
  }

  /**
   * Helper methods for scoring
   */
  incrementLanguageScore(language, score) {
    this.detectionResults.languages[language] = (this.detectionResults.languages[language] || 0) + score;
  }

  incrementFrameworkScore(framework, score) {
    this.detectionResults.frameworks[framework] = (this.detectionResults.frameworks[framework] || 0) + score;
  }

  /**
   * Calculate confidence scores for all detected technologies
   */
  calculateConfidenceScores() {
    // Normalize language scores
    const maxLangScore = Math.max(...Object.values(this.detectionResults.languages));
    if (maxLangScore > 0) {
      for (const lang in this.detectionResults.languages) {
        this.detectionResults.languages[lang] = Math.min(
          this.detectionResults.languages[lang] / maxLangScore,
          1.0
        );
      }
    }

    // Normalize framework scores
    const maxFrameworkScore = Math.max(...Object.values(this.detectionResults.frameworks), 1);
    for (const framework in this.detectionResults.frameworks) {
      this.detectionResults.frameworks[framework] = Math.min(
        this.detectionResults.frameworks[framework] / maxFrameworkScore,
        1.0
      );
    }

    // Calculate overall confidence
    const totalLanguages = Object.keys(this.detectionResults.languages).length;
    const totalFrameworks = Object.keys(this.detectionResults.frameworks).length;
    this.detectionResults.confidence = Math.min((totalLanguages * 0.6 + totalFrameworks * 0.4) / 2, 1.0);
  }

  /**
   * Determine the primary project type based on scores
   */
  determinePrimaryProjectType() {
    const languages = this.detectionResults.languages;
    const frameworks = this.detectionResults.frameworks;

    const primaryLang = Object.keys(languages).reduce((a, b) =>
      languages[a] > languages[b] ? a : b, Object.keys(languages)[0]
    );

    const primaryFramework = Object.keys(frameworks).reduce((a, b) =>
      frameworks[a] > frameworks[b] ? a : b, Object.keys(frameworks)[0]
    );

    // Determine project type
    if (frameworks.react && languages.typescript) {
      this.detectionResults.projectType = 'react-typescript';
    } else if (frameworks.react) {
      this.detectionResults.projectType = 'react';
    } else if (frameworks.nextjs) {
      this.detectionResults.projectType = 'nextjs';
    } else if (frameworks.vue) {
      this.detectionResults.projectType = 'vue';
    } else if (frameworks.express) {
      this.detectionResults.projectType = 'express-api';
    } else if (frameworks.django) {
      this.detectionResults.projectType = 'django';
    } else if (frameworks.flask) {
      this.detectionResults.projectType = 'flask';
    } else if (frameworks.fastapi) {
      this.detectionResults.projectType = 'fastapi';
    } else if (primaryLang) {
      this.detectionResults.projectType = primaryLang;
    } else {
      this.detectionResults.projectType = 'unknown';
    }

    this.detectionResults.metadata.primaryLanguage = primaryLang;
    this.detectionResults.metadata.primaryFramework = primaryFramework;
  }

  /**
   * Get recommendations for tooling and best practices
   */
  getRecommendations() {
    const recommendations = {
      linting: [],
      testing: [],
      building: [],
      deployment: []
    };

    const { languages, frameworks } = this.detectionResults;

    // Linting recommendations
    if (languages.javascript || languages.typescript) {
      recommendations.linting.push('ESLint', 'Prettier');
    }
    if (languages.python) {
      recommendations.linting.push('Black', 'Flake8', 'mypy');
    }

    // Testing recommendations
    if (frameworks.react || frameworks.nextjs) {
      recommendations.testing.push('Jest', 'React Testing Library');
    } else if (languages.javascript || languages.typescript) {
      recommendations.testing.push('Jest', 'Vitest');
    }
    if (languages.python) {
      recommendations.testing.push('pytest', 'unittest');
    }

    // Build recommendations
    if (frameworks.react && !frameworks.nextjs) {
      recommendations.building.push('Vite', 'Create React App');
    }
    if (languages.typescript) {
      recommendations.building.push('tsc', 'esbuild');
    }

    return recommendations;
  }

  /**
   * Export results for use by other systems
   */
  exportResults() {
    return {
      ...this.detectionResults,
      timestamp: new Date().toISOString(),
      recommendations: this.getRecommendations()
    };
  }
}

export default LanguageDetector;