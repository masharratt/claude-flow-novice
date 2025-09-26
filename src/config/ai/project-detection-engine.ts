/**
 * AI-Driven Project Detection Engine
 *
 * Automatically analyzes project structure, dependencies, and patterns
 * to generate intelligent configuration defaults.
 */

import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProjectFeatures {
  fileTypes: Map<string, number>;
  directoryStructure: StructurePattern[];
  packageManagers: string[];
  dependencies: DependencyInfo[];
  importPatterns: ImportPattern[];
  apiPatterns: APIPattern[];
  configFiles: ConfigFile[];
  buildTools: BuildTool[];
  gitMetadata: GitMetadata | null;
  documentation: DocumentationInfo[];
}

export interface ProjectAnalysis {
  type: ProjectType;
  language: string;
  framework?: string;
  complexity: ProjectComplexity;
  teamSize: number;
  patterns: ProjectPattern[];
  confidence: number;
}

export interface ProjectClassification {
  primary: ClassificationResult;
  secondary: ClassificationResult[];
  confidence: number;
  reasoning: string[];
}

export interface ClassificationResult {
  type: ProjectType;
  confidence: number;
  evidence: string[];
}

export type ProjectType =
  | 'web-app' | 'api' | 'cli' | 'library' | 'mobile'
  | 'ml' | 'data' | 'game' | 'desktop' | 'iot' | 'mixed';

export type ProjectComplexity = 'small' | 'medium' | 'large' | 'enterprise';

export interface StructurePattern {
  path: string;
  type: 'file' | 'directory';
  importance: number;
  pattern: string;
}

export interface DependencyInfo {
  name: string;
  version?: string;
  type: 'production' | 'development' | 'peer';
  ecosystem: string;
  category: string;
}

export interface ImportPattern {
  pattern: string;
  count: number;
  category: 'framework' | 'utility' | 'ui' | 'data' | 'testing';
}

export interface APIPattern {
  type: 'rest' | 'graphql' | 'websocket' | 'rpc' | 'event-driven';
  endpoints: number;
  methods: string[];
}

export interface ConfigFile {
  name: string;
  path: string;
  type: string;
  importance: number;
}

export interface BuildTool {
  name: string;
  confidence: number;
  configFile?: string;
}

export interface GitMetadata {
  branchCount: number;
  commitCount: number;
  contributorCount: number;
  lastActivity: Date;
  languages: LanguageStats[];
}

export interface LanguageStats {
  language: string;
  percentage: number;
  bytes: number;
}

export interface DocumentationInfo {
  type: 'readme' | 'docs' | 'wiki' | 'api-docs';
  quality: number;
  coverage: number;
}

export type ProjectPattern =
  | 'microservices' | 'monolith' | 'serverless' | 'jamstack'
  | 'spa' | 'ssr' | 'static' | 'mobile-app' | 'cross-platform'
  | 'ml-pipeline' | 'data-pipeline' | 'real-time' | 'batch-processing';

/**
 * Advanced project detection engine using multi-modal analysis
 */
export class ProjectDetectionEngine {
  private classificationPatterns: Map<ProjectType, ClassificationPattern>;
  private confidenceThreshold = 0.7;
  private maxAnalysisDepth = 3;
  private maxFilesToAnalyze = 1000;

  constructor() {
    this.initializeClassificationPatterns();
  }

  /**
   * Main entry point - analyzes project and returns comprehensive analysis
   */
  async analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
    const features = await this.extractFeatures(projectPath);
    const classification = await this.classifyProject(features);

    return {
      type: classification.primary.type,
      language: await this.determinePrimaryLanguage(features),
      framework: await this.determineFramework(features),
      complexity: await this.assessComplexity(features),
      teamSize: await this.estimateTeamSize(features),
      patterns: await this.identifyPatterns(features),
      confidence: classification.confidence
    };
  }

  /**
   * Extracts comprehensive features from project structure
   */
  private async extractFeatures(projectPath: string): Promise<ProjectFeatures> {
    const [
      fileTypes,
      directoryStructure,
      packageManagers,
      dependencies,
      importPatterns,
      apiPatterns,
      configFiles,
      buildTools,
      gitMetadata,
      documentation
    ] = await Promise.all([
      this.analyzeFileTypes(projectPath),
      this.analyzeStructure(projectPath),
      this.detectPackageManagers(projectPath),
      this.analyzeDependencies(projectPath),
      this.analyzeImports(projectPath),
      this.detectApiPatterns(projectPath),
      this.findConfigFiles(projectPath),
      this.detectBuildTools(projectPath),
      this.analyzeGitHistory(projectPath),
      this.analyzeDocumentation(projectPath)
    ]);

    return {
      fileTypes,
      directoryStructure,
      packageManagers,
      dependencies,
      importPatterns,
      apiPatterns,
      configFiles,
      buildTools,
      gitMetadata,
      documentation
    };
  }

  /**
   * Multi-modal project classification using rule-based and heuristic approaches
   */
  async classifyProject(features: ProjectFeatures): Promise<ProjectClassification> {
    const results: ClassificationResult[] = [];

    // Apply each classification pattern
    for (const [type, pattern] of this.classificationPatterns) {
      const result = await this.applyClassificationPattern(features, type, pattern);
      if (result.confidence > 0.1) { // Only include meaningful results
        results.push(result);
      }
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);

    const primary = results[0];
    const secondary = results.slice(1, 4); // Top 3 alternatives

    // Calculate overall confidence using ensemble approach
    const overallConfidence = this.calculateEnsembleConfidence(results);

    // Generate reasoning
    const reasoning = this.generateReasoning(primary, features);

    return {
      primary,
      secondary,
      confidence: overallConfidence,
      reasoning
    };
  }

  /**
   * Analyzes file types and their distribution
   */
  private async analyzeFileTypes(projectPath: string): Promise<Map<string, number>> {
    const fileTypes = new Map<string, number>();

    try {
      const files = await this.getAllFiles(projectPath, this.maxFilesToAnalyze);

      for (const file of files) {
        const ext = extname(file).toLowerCase();
        if (ext) {
          fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
        }
      }
    } catch (error) {
      console.warn('Error analyzing file types:', error);
    }

    return fileTypes;
  }

  /**
   * Analyzes directory structure patterns
   */
  private async analyzeStructure(projectPath: string): Promise<StructurePattern[]> {
    const patterns: StructurePattern[] = [];
    const importantDirs = [
      'src', 'lib', 'app', 'components', 'pages', 'routes', 'controllers',
      'models', 'views', 'services', 'utils', 'helpers', 'config',
      'tests', 'test', '__tests__', 'spec', 'e2e',
      'public', 'static', 'assets', 'resources',
      'docs', 'documentation', 'wiki',
      'scripts', 'bin', 'tools', 'build',
      'migrations', 'seeds', 'fixtures'
    ];

    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && importantDirs.includes(entry.name)) {
          patterns.push({
            path: entry.name,
            type: 'directory',
            importance: this.calculateDirectoryImportance(entry.name),
            pattern: this.getDirectoryPattern(entry.name)
          });
        }
      }
    } catch (error) {
      console.warn('Error analyzing structure:', error);
    }

    return patterns;
  }

  /**
   * Detects package managers and their configuration files
   */
  private async detectPackageManagers(projectPath: string): Promise<string[]> {
    const packageManagers: string[] = [];
    const pmFiles = [
      { name: 'package.json', manager: 'npm' },
      { name: 'yarn.lock', manager: 'yarn' },
      { name: 'pnpm-lock.yaml', manager: 'pnpm' },
      { name: 'requirements.txt', manager: 'pip' },
      { name: 'Pipfile', manager: 'pipenv' },
      { name: 'pyproject.toml', manager: 'poetry' },
      { name: 'Gemfile', manager: 'bundler' },
      { name: 'Cargo.toml', manager: 'cargo' },
      { name: 'go.mod', manager: 'go' },
      { name: 'pom.xml', manager: 'maven' },
      { name: 'build.gradle', manager: 'gradle' },
      { name: 'composer.json', manager: 'composer' }
    ];

    for (const { name, manager } of pmFiles) {
      try {
        await fs.access(join(projectPath, name));
        packageManagers.push(manager);
      } catch {
        // File doesn't exist, continue
      }
    }

    return packageManagers;
  }

  /**
   * Analyzes project dependencies from various package managers
   */
  private async analyzeDependencies(projectPath: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    // Analyze package.json
    await this.analyzePackageJson(projectPath, dependencies);

    // Analyze requirements.txt
    await this.analyzeRequirementsTxt(projectPath, dependencies);

    // Analyze Cargo.toml
    await this.analyzeCargoToml(projectPath, dependencies);

    return dependencies;
  }

  /**
   * Analyzes import patterns in source files
   */
  private async analyzeImports(projectPath: string): Promise<ImportPattern[]> {
    const patterns: ImportPattern[] = [];
    const importRegexes = [
      /import\s+.*?from\s+['"`]([^'"`]+)['"`]/g, // ES6/TypeScript
      /import\s+['"`]([^'"`]+)['"`]/g, // ES6 side-effect
      /const\s+.*?=\s+require\(['"`]([^'"`]+)['"`]\)/g, // CommonJS
      /from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+import/g, // Python
      /use\s+([^;]+);/g, // Rust
      /import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g // Java
    ];

    try {
      const sourceFiles = await this.getSourceFiles(projectPath);
      const importCounts = new Map<string, number>();

      for (const file of sourceFiles.slice(0, 100)) { // Limit to first 100 files
        const content = await fs.readFile(file, 'utf-8');

        for (const regex of importRegexes) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            const importPath = match[1];
            importCounts.set(importPath, (importCounts.get(importPath) || 0) + 1);
          }
        }
      }

      // Convert to patterns
      for (const [pattern, count] of importCounts) {
        patterns.push({
          pattern,
          count,
          category: this.categorizeImport(pattern)
        });
      }
    } catch (error) {
      console.warn('Error analyzing imports:', error);
    }

    return patterns.sort((a, b) => b.count - a.count).slice(0, 50);
  }

  /**
   * Detects API patterns and architectures
   */
  private async detectApiPatterns(projectPath: string): Promise<APIPattern[]> {
    const patterns: APIPattern[] = [];

    try {
      const sourceFiles = await this.getSourceFiles(projectPath);

      // Look for REST API patterns
      const restPattern = await this.detectRestPatterns(sourceFiles);
      if (restPattern) patterns.push(restPattern);

      // Look for GraphQL patterns
      const graphqlPattern = await this.detectGraphQLPatterns(sourceFiles);
      if (graphqlPattern) patterns.push(graphqlPattern);

      // Look for WebSocket patterns
      const wsPattern = await this.detectWebSocketPatterns(sourceFiles);
      if (wsPattern) patterns.push(wsPattern);

    } catch (error) {
      console.warn('Error detecting API patterns:', error);
    }

    return patterns;
  }

  /**
   * Finds and analyzes configuration files
   */
  private async findConfigFiles(projectPath: string): Promise<ConfigFile[]> {
    const configFiles: ConfigFile[] = [];
    const configPatterns = [
      { pattern: /\.config\.(js|ts|json|yaml|yml)$/, importance: 0.9 },
      { pattern: /^(webpack|rollup|vite|parcel)\.config\.(js|ts)$/, importance: 0.8 },
      { pattern: /^(jest|vitest|karma)\.config\.(js|ts|json)$/, importance: 0.7 },
      { pattern: /^(eslint|prettier|babel)\.config\.(js|ts|json)$/, importance: 0.7 },
      { pattern: /^\.(eslintrc|prettierrc|babelrc)/, importance: 0.6 },
      { pattern: /^(docker|docker-compose)\.(yml|yaml)$/, importance: 0.8 },
      { pattern: /^Dockerfile/, importance: 0.8 },
      { pattern: /^(tsconfig|jsconfig)\.json$/, importance: 0.7 }
    ];

    try {
      const files = await this.getAllFiles(projectPath, 500);

      for (const file of files) {
        const fileName = basename(file);

        for (const { pattern, importance } of configPatterns) {
          if (pattern.test(fileName)) {
            configFiles.push({
              name: fileName,
              path: file,
              type: this.getConfigType(fileName),
              importance
            });
            break;
          }
        }
      }
    } catch (error) {
      console.warn('Error finding config files:', error);
    }

    return configFiles.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Detects build tools and task runners
   */
  private async detectBuildTools(projectPath: string): Promise<BuildTool[]> {
    const buildTools: BuildTool[] = [];

    const toolDetectors = [
      {
        name: 'webpack',
        indicators: ['webpack.config.js', 'webpack.config.ts', 'webpack'],
        confidence: 0.9
      },
      {
        name: 'vite',
        indicators: ['vite.config.js', 'vite.config.ts', 'vite'],
        confidence: 0.9
      },
      {
        name: 'rollup',
        indicators: ['rollup.config.js', 'rollup.config.ts', 'rollup'],
        confidence: 0.8
      },
      {
        name: 'parcel',
        indicators: ['.parcelrc', 'parcel'],
        confidence: 0.8
      },
      {
        name: 'gulp',
        indicators: ['gulpfile.js', 'gulpfile.ts', 'gulp'],
        confidence: 0.7
      },
      {
        name: 'grunt',
        indicators: ['Gruntfile.js', 'grunt'],
        confidence: 0.7
      }
    ];

    // Check package.json dependencies
    const packageJson = await this.readPackageJson(projectPath);

    for (const tool of toolDetectors) {
      let confidence = 0;
      let configFile: string | undefined;

      // Check for config files
      for (const indicator of tool.indicators) {
        try {
          const path = join(projectPath, indicator);
          await fs.access(path);
          confidence = Math.max(confidence, tool.confidence);
          if (indicator.includes('.')) {
            configFile = indicator;
          }
        } catch {
          // File doesn't exist
        }
      }

      // Check dependencies
      if (packageJson && tool.name in packageJson.dependencies) {
        confidence = Math.max(confidence, 0.6);
      }
      if (packageJson && tool.name in packageJson.devDependencies) {
        confidence = Math.max(confidence, 0.8);
      }

      if (confidence > 0.3) {
        buildTools.push({
          name: tool.name,
          confidence,
          configFile
        });
      }
    }

    return buildTools.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyzes Git repository metadata
   */
  private async analyzeGitHistory(projectPath: string): Promise<GitMetadata | null> {
    try {
      // Check if it's a Git repository
      await fs.access(join(projectPath, '.git'));

      const [branchInfo, commitInfo, languageInfo] = await Promise.all([
        this.getGitBranchInfo(projectPath),
        this.getGitCommitInfo(projectPath),
        this.getGitLanguageInfo(projectPath)
      ]);

      return {
        branchCount: branchInfo.branchCount,
        commitCount: commitInfo.commitCount,
        contributorCount: commitInfo.contributorCount,
        lastActivity: commitInfo.lastActivity,
        languages: languageInfo
      };
    } catch {
      return null; // Not a Git repository or access error
    }
  }

  /**
   * Analyzes documentation quality and coverage
   */
  private async analyzeDocumentation(projectPath: string): Promise<DocumentationInfo[]> {
    const documentation: DocumentationInfo[] = [];

    const docPatterns = [
      { pattern: /^readme\.(md|txt|rst)$/i, type: 'readme' as const },
      { pattern: /^(docs?|documentation)\//i, type: 'docs' as const },
      { pattern: /\.wiki\//i, type: 'wiki' as const },
      { pattern: /api-docs?\//i, type: 'api-docs' as const }
    ];

    try {
      const files = await this.getAllFiles(projectPath, 200);

      for (const { pattern, type } of docPatterns) {
        const matchingFiles = files.filter(file => pattern.test(file));

        if (matchingFiles.length > 0) {
          const quality = await this.assessDocumentationQuality(matchingFiles);
          documentation.push({
            type,
            quality,
            coverage: this.calculateDocumentationCoverage(matchingFiles, files.length)
          });
        }
      }
    } catch (error) {
      console.warn('Error analyzing documentation:', error);
    }

    return documentation;
  }

  /**
   * Applies a classification pattern to project features
   */
  private async applyClassificationPattern(
    features: ProjectFeatures,
    type: ProjectType,
    pattern: ClassificationPattern
  ): Promise<ClassificationResult> {
    let score = 0;
    const evidence: string[] = [];
    const maxScore = pattern.indicators.reduce((sum, indicator) => sum + indicator.weight, 0);

    for (const indicator of pattern.indicators) {
      const indicatorScore = await this.evaluateIndicator(features, indicator);

      if (indicatorScore > 0) {
        score += indicatorScore * indicator.weight;
        evidence.push(`${indicator.description} (score: ${indicatorScore.toFixed(2)})`);
      }
    }

    const confidence = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;

    return {
      type,
      confidence,
      evidence
    };
  }

  /**
   * Determines the primary programming language
   */
  private async determinePrimaryLanguage(features: ProjectFeatures): Promise<string> {
    const languageMap = new Map([
      ['.js', 'javascript'],
      ['.jsx', 'javascript'],
      ['.ts', 'typescript'],
      ['.tsx', 'typescript'],
      ['.py', 'python'],
      ['.java', 'java'],
      ['.kt', 'kotlin'],
      ['.rs', 'rust'],
      ['.go', 'go'],
      ['.rb', 'ruby'],
      ['.php', 'php'],
      ['.cs', 'csharp'],
      ['.cpp', 'cpp'],
      ['.c', 'c'],
      ['.swift', 'swift'],
      ['.dart', 'dart'],
      ['.scala', 'scala'],
      ['.clj', 'clojure']
    ]);

    let maxCount = 0;
    let primaryLanguage = 'unknown';

    for (const [ext, count] of features.fileTypes) {
      if (languageMap.has(ext) && count > maxCount) {
        maxCount = count;
        primaryLanguage = languageMap.get(ext)!;
      }
    }

    return primaryLanguage;
  }

  /**
   * Determines the primary framework
   */
  private async determineFramework(features: ProjectFeatures): Promise<string | undefined> {
    const frameworkIndicators = new Map([
      ['react', ['react', '@types/react', 'react-dom']],
      ['vue', ['vue', '@vue/cli', 'nuxt']],
      ['angular', ['@angular/core', '@angular/cli', 'ng']],
      ['svelte', ['svelte', '@sveltejs/kit']],
      ['express', ['express', 'express-generator']],
      ['fastify', ['fastify']],
      ['koa', ['koa']],
      ['django', ['Django', 'django-rest-framework']],
      ['flask', ['Flask', 'flask-restful']],
      ['fastapi', ['fastapi', 'uvicorn']],
      ['spring', ['spring-boot', 'springframework']],
      ['rails', ['rails', 'ruby-on-rails']],
      ['laravel', ['laravel', 'illuminate']]
    ]);

    const dependencyNames = new Set(features.dependencies.map(dep => dep.name.toLowerCase()));

    for (const [framework, indicators] of frameworkIndicators) {
      if (indicators.some(indicator => dependencyNames.has(indicator.toLowerCase()))) {
        return framework;
      }
    }

    return undefined;
  }

  /**
   * Assesses project complexity based on various metrics
   */
  private async assessComplexity(features: ProjectFeatures): Promise<ProjectComplexity> {
    let complexityScore = 0;

    // File count
    const totalFiles = Array.from(features.fileTypes.values()).reduce((sum, count) => sum + count, 0);
    if (totalFiles > 1000) complexityScore += 3;
    else if (totalFiles > 100) complexityScore += 2;
    else if (totalFiles > 20) complexityScore += 1;

    // Dependency count
    const depCount = features.dependencies.length;
    if (depCount > 100) complexityScore += 3;
    else if (depCount > 50) complexityScore += 2;
    else if (depCount > 10) complexityScore += 1;

    // Directory structure complexity
    const structureComplexity = features.directoryStructure.length;
    if (structureComplexity > 15) complexityScore += 2;
    else if (structureComplexity > 8) complexityScore += 1;

    // Configuration files
    const configComplexity = features.configFiles.length;
    if (configComplexity > 10) complexityScore += 2;
    else if (configComplexity > 5) complexityScore += 1;

    // Git metadata (team size indicator)
    if (features.gitMetadata) {
      if (features.gitMetadata.contributorCount > 20) complexityScore += 3;
      else if (features.gitMetadata.contributorCount > 5) complexityScore += 2;
      else if (features.gitMetadata.contributorCount > 1) complexityScore += 1;
    }

    // Map score to complexity level
    if (complexityScore >= 10) return 'enterprise';
    if (complexityScore >= 6) return 'large';
    if (complexityScore >= 3) return 'medium';
    return 'small';
  }

  // Helper methods and utility functions...

  private initializeClassificationPatterns(): void {
    this.classificationPatterns = new Map();

    // Web Application patterns
    this.classificationPatterns.set('web-app', {
      indicators: [
        {
          type: 'dependency',
          values: ['react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt.js'],
          weight: 0.8,
          description: 'Frontend framework dependency'
        },
        {
          type: 'directory',
          values: ['components', 'pages', 'views', 'public', 'static'],
          weight: 0.6,
          description: 'Web application directory structure'
        },
        {
          type: 'file_extension',
          values: ['.jsx', '.tsx', '.vue', '.html', '.css', '.scss'],
          weight: 0.4,
          description: 'Web development file types'
        }
      ]
    });

    // API patterns
    this.classificationPatterns.set('api', {
      indicators: [
        {
          type: 'dependency',
          values: ['express', 'fastify', 'koa', 'django', 'flask', 'fastapi'],
          weight: 0.9,
          description: 'API framework dependency'
        },
        {
          type: 'directory',
          values: ['routes', 'controllers', 'endpoints', 'api', 'handlers'],
          weight: 0.7,
          description: 'API directory structure'
        },
        {
          type: 'file_pattern',
          values: ['router', 'controller', 'handler', 'endpoint'],
          weight: 0.5,
          description: 'API file naming patterns'
        }
      ]
    });

    // CLI patterns
    this.classificationPatterns.set('cli', {
      indicators: [
        {
          type: 'dependency',
          values: ['commander', 'yargs', 'inquirer', 'chalk', 'ora'],
          weight: 0.8,
          description: 'CLI framework dependency'
        },
        {
          type: 'file_name',
          values: ['cli.js', 'bin.js', 'index.js'],
          weight: 0.6,
          description: 'CLI entry point files'
        },
        {
          type: 'directory',
          values: ['bin', 'cli', 'commands'],
          weight: 0.5,
          description: 'CLI directory structure'
        }
      ]
    });

    // Add more patterns for other project types...
  }

  private async getAllFiles(dir: string, maxFiles: number): Promise<string[]> {
    const files: string[] = [];
    const stack = [dir];
    const visited = new Set<string>();

    while (stack.length > 0 && files.length < maxFiles) {
      const currentDir = stack.pop()!;

      if (visited.has(currentDir)) continue;
      visited.add(currentDir);

      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          if (files.length >= maxFiles) break;

          const fullPath = join(currentDir, entry.name);

          if (entry.isFile()) {
            files.push(fullPath);
          } else if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
            stack.push(fullPath);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    return files;
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = new Set([
      'node_modules', '.git', '.svn', '.hg', 'dist', 'build',
      '.next', '.nuxt', 'coverage', '.nyc_output', '__pycache__',
      'venv', '.env', '.venv', 'target', 'vendor'
    ]);

    return skipDirs.has(name) || name.startsWith('.');
  }

  // Additional helper methods would be implemented here...
  private calculateDirectoryImportance(name: string): number {
    const importance = new Map([
      ['src', 1.0], ['lib', 0.9], ['app', 0.9],
      ['components', 0.8], ['pages', 0.8], ['views', 0.8],
      ['routes', 0.8], ['controllers', 0.8], ['models', 0.8],
      ['services', 0.7], ['utils', 0.6], ['helpers', 0.6],
      ['config', 0.7], ['tests', 0.6], ['docs', 0.5]
    ]);

    return importance.get(name) || 0.3;
  }

  private getDirectoryPattern(name: string): string {
    const patterns = new Map([
      ['src', 'source-code'], ['lib', 'library'], ['app', 'application'],
      ['components', 'ui-components'], ['pages', 'routing'], ['views', 'templates'],
      ['routes', 'api-routing'], ['controllers', 'business-logic'], ['models', 'data-models'],
      ['services', 'business-services'], ['utils', 'utilities'], ['config', 'configuration'],
      ['tests', 'testing'], ['docs', 'documentation']
    ]);

    return patterns.get(name) || 'unknown';
  }

  private categorizeImport(importPath: string): 'framework' | 'utility' | 'ui' | 'data' | 'testing' {
    if (importPath.includes('react') || importPath.includes('vue') || importPath.includes('angular')) {
      return 'framework';
    }
    if (importPath.includes('test') || importPath.includes('jest') || importPath.includes('mocha')) {
      return 'testing';
    }
    if (importPath.includes('ui') || importPath.includes('component') || importPath.includes('style')) {
      return 'ui';
    }
    if (importPath.includes('data') || importPath.includes('api') || importPath.includes('http')) {
      return 'data';
    }
    return 'utility';
  }

  // More helper methods would continue here...
}

interface ClassificationPattern {
  indicators: ClassificationIndicator[];
}

interface ClassificationIndicator {
  type: 'dependency' | 'directory' | 'file_extension' | 'file_name' | 'file_pattern';
  values: string[];
  weight: number;
  description: string;
}

// Additional type definitions and implementations would continue...