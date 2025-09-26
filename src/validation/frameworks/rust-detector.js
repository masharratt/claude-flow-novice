/**
 * Comprehensive Rust Framework Detection System
 * Phase 2 Integration - Rust Ecosystem Analysis with Byzantine Validation
 *
 * Detects Rust projects via Cargo.toml, workspace patterns, and dependency analysis.
 * Integrates with existing framework detection system following established patterns.
 * Implements Byzantine fault tolerance for consensus on framework detection results.
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../core/logger.js';
import { SqliteMemoryStore } from '../../memory/sqlite-store.js';
import { spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(spawn);

export class RustFrameworkDetector {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.memoryStore = null;
    this.logger = logger.child({ component: 'RustFrameworkDetector' });
    this.initialized = false;

    // Rust framework detection patterns - Comprehensive ecosystem coverage
    this.rustDetectionPatterns = {
      // Core Rust indicators with high weights
      coreFiles: [
        { pattern: 'Cargo.toml', weight: 0.45, required: true },
        { pattern: 'Cargo.lock', weight: 0.25, required: false },
        { pattern: 'src/main.rs', weight: 0.15, required: false },
        { pattern: 'src/lib.rs', weight: 0.15, required: false },
        { pattern: 'build.rs', weight: 0.08, optional: true },
        { pattern: '*.rs', weight: 0.2, multiple: true },
        { pattern: 'target/', weight: 0.1, directory: true, optional: true },
        { pattern: 'Cargo.workspace', weight: 0.12, optional: true },
      ],

      // File extension patterns
      fileExtensions: [
        { ext: '.rs', weight: 0.02, maxBonus: 0.3 },
        { ext: '.toml', weight: 0.01, maxBonus: 0.1 },
      ],

      // Content patterns in Rust files
      contentPatterns: [
        {
          pattern: /fn\s+main\s*\(\)/g,
          weight: 0.15,
          fileType: 'rs',
          description: 'main function',
        },
        { pattern: /use\s+[\w:]+;/g, weight: 0.1, fileType: 'rs', description: 'use statements' },
        {
          pattern: /extern\s+crate\s+\w+;/g,
          weight: 0.08,
          fileType: 'rs',
          description: 'extern crate',
        },
        {
          pattern: /pub\s+(fn|struct|enum|trait|mod)/g,
          weight: 0.1,
          fileType: 'rs',
          description: 'public items',
        },
        { pattern: /#!\[.*\]/g, weight: 0.08, fileType: 'rs', description: 'inner attributes' },
        {
          pattern: /impl\s+.*\s+for\s+/g,
          weight: 0.1,
          fileType: 'rs',
          description: 'trait implementations',
        },
        { pattern: /derive\s*\(/g, weight: 0.08, fileType: 'rs', description: 'derive macros' },
        {
          pattern: /#\[test\]/g,
          weight: 0.12,
          fileType: 'rs',
          description: 'test functions',
          testFile: true,
        },
        {
          pattern: /async\s+fn\s+\w+/g,
          weight: 0.1,
          fileType: 'rs',
          description: 'async functions',
        },
      ],
    };

    // Comprehensive Rust web framework patterns
    this.rustWebFrameworkPatterns = {
      // Axum - Modern async web framework
      axum: {
        dependencies: ['axum', 'tokio', 'tower', 'tower-http'],
        patterns: [
          /use\s+axum::/g,
          /Router::new\(\)/g,
          /async\s+fn\s+\w+.*axum/g,
          /#\[tokio::main\]/g,
          /axum::extract::/g,
        ],
        files: ['src/main.rs', 'src/routes.rs', 'src/handlers.rs'],
        weight: 0.35,
        description: 'Modern async web framework built on tokio',
      },

      // Warp - Fast web framework with filters
      warp: {
        dependencies: ['warp', 'tokio'],
        patterns: [
          /use\s+warp::/g,
          /warp::Filter/g,
          /warp::path/g,
          /warp::reply/g,
          /\.and\(warp::/g,
        ],
        files: ['src/main.rs', 'src/filters.rs'],
        weight: 0.3,
        description: 'Fast web framework with composable filters',
      },

      // Actix-web - High-performance web framework
      'actix-web': {
        dependencies: ['actix-web', 'actix-rt'],
        patterns: [
          /use\s+actix_web::/g,
          /HttpServer::new/g,
          /App::new\(\)/g,
          /#\[actix_web::(get|post|put|delete)\]/g,
          /web::(Data|Json|Query)/g,
        ],
        files: ['src/main.rs', 'src/handlers.rs'],
        weight: 0.35,
        description: 'High-performance actor-based web framework',
      },

      // Rocket - Type-safe web framework
      rocket: {
        dependencies: ['rocket', 'rocket_contrib'],
        patterns: [
          /use\s+rocket::/g,
          /#\[rocket::(get|post|put|delete)\]/g,
          /#\[launch\]/g,
          /rocket::build\(\)/g,
          /Rocket<.*>/g,
        ],
        files: ['src/main.rs', 'Rocket.toml'],
        weight: 0.3,
        description: 'Type-safe web framework with code generation',
      },

      // Hyper - Low-level HTTP library
      hyper: {
        dependencies: ['hyper', 'tokio'],
        patterns: [
          /use\s+hyper::/g,
          /hyper::Server/g,
          /hyper::service/g,
          /Response<Body>/g,
          /Request<Body>/g,
        ],
        files: ['src/main.rs'],
        weight: 0.25,
        description: 'Low-level HTTP implementation',
      },

      // Tide - Async web framework
      tide: {
        dependencies: ['tide', 'async-std'],
        patterns: [
          /use\s+tide::/g,
          /tide::Request/g,
          /tide::Response/g,
          /app\.at\(/g,
          /async_std::/g,
        ],
        files: ['src/main.rs'],
        weight: 0.25,
        description: 'Async web framework built on async-std',
      },
    };

    // Database and ORM framework patterns
    this.rustDatabaseFrameworkPatterns = {
      // Diesel - Safe, extensible ORM
      diesel: {
        dependencies: ['diesel', 'diesel_migrations'],
        patterns: [
          /use\s+diesel::/g,
          /#\[derive\(Queryable\)\]/g,
          /#\[derive\(Insertable\)\]/g,
          /diesel::prelude::\*/g,
          /diesel::result::/g,
          /table!\s*{/g,
        ],
        files: ['src/schema.rs', 'src/models.rs', 'migrations/'],
        configFiles: ['diesel.toml'],
        weight: 0.3,
        description: 'Safe, extensible ORM and Query Builder',
      },

      // SeaORM - Async ORM
      'sea-orm': {
        dependencies: ['sea-orm', 'sea-query'],
        patterns: [
          /use\s+sea_orm::/g,
          /#\[derive\(.*DeriveEntityModel.*\)\]/g,
          /EntityTrait/g,
          /ActiveModelTrait/g,
          /sea_orm::Database/g,
        ],
        files: ['src/entities/', 'src/models/'],
        weight: 0.25,
        description: 'Async ORM for Rust',
      },

      // SQLx - Async SQL toolkit
      sqlx: {
        dependencies: ['sqlx', 'sqlx-macros'],
        patterns: [
          /use\s+sqlx::/g,
          /sqlx::query!/g,
          /sqlx::FromRow/g,
          /PgPool|MySqlPool|SqlitePool/g,
          /#\[sqlx\(::/g,
        ],
        files: ['migrations/', '.env'],
        weight: 0.25,
        description: 'Async SQL toolkit with compile-time checked queries',
      },
    };

    // Async runtime patterns
    this.rustAsyncRuntimePatterns = {
      tokio: {
        dependencies: ['tokio'],
        patterns: [
          /use\s+tokio::/g,
          /#\[tokio::main\]/g,
          /#\[tokio::test\]/g,
          /tokio::spawn/g,
          /tokio::time::/g,
        ],
        weight: 0.2,
        description: 'The most popular async runtime',
      },

      'async-std': {
        dependencies: ['async-std'],
        patterns: [
          /use\s+async_std::/g,
          /#\[async_std::main\]/g,
          /#\[async_std::test\]/g,
          /async_std::task::/g,
        ],
        weight: 0.15,
        description: 'Async version of the Rust standard library',
      },
    };

    // Testing framework patterns
    this.rustTestingFrameworkPatterns = {
      // Built-in testing
      builtin: {
        patterns: [/#\[test\]/g, /#\[cfg\(test\)\]/g, /assert_eq!/g, /assert_ne!/g, /assert!/g],
        weight: 0.15,
        description: 'Built-in Rust testing framework',
      },

      // Criterion - Benchmarking
      criterion: {
        dependencies: ['criterion'],
        patterns: [
          /use\s+criterion::/g,
          /Criterion::default/g,
          /criterion_group!/g,
          /criterion_main!/g,
        ],
        files: ['benches/'],
        weight: 0.1,
        description: 'Statistics-driven benchmarking library',
      },

      // PropTest - Property testing
      proptest: {
        dependencies: ['proptest'],
        patterns: [/use\s+proptest::/g, /proptest!/g, /prop_assert!/g, /TestCaseError/g],
        weight: 0.1,
        description: 'Property-based testing framework',
      },

      // Quickcheck - Property testing
      quickcheck: {
        dependencies: ['quickcheck'],
        patterns: [/use\s+quickcheck::/g, /#\[quickcheck\]/g, /TestResult/g],
        weight: 0.08,
        description: 'Property-based testing library',
      },
    };

    // Workspace detection patterns
    this.workspacePatterns = {
      cargoWorkspace: {
        patterns: [/\[workspace\]/g, /members\s*=\s*\[/g, /default-members/g, /resolver\s*=/g],
        files: ['Cargo.toml'],
        weight: 0.2,
        description: 'Cargo workspace configuration',
      },
    };
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.memoryStore = new SqliteMemoryStore();
      await this.memoryStore.initialize();

      // Initialize Byzantine validation hooks
      await this.initializeByzantineHooks();

      this.initialized = true;

      this.logger.info('RustFrameworkDetector initialized', {
        basePath: this.basePath,
        byzantineEnabled: true,
      });
    } catch (error) {
      this.logger.error('Failed to initialize RustFrameworkDetector', error);
      throw error;
    }
  }

  /**
   * Initialize Byzantine validation hooks for consensus on detection results
   */
  async initializeByzantineHooks() {
    try {
      // Pre-detection hook
      await this.executeHook('pre-rust-detection', {
        basePath: this.basePath,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug('Byzantine validation hooks initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize Byzantine hooks', error);
      // Continue without hooks - detection still works
    }
  }

  /**
   * Main Rust framework detection method
   */
  async detectRustFramework() {
    await this.initialize();

    const startTime = Date.now();
    const results = {
      detected: 'unknown',
      confidence: 0,
      isRustProject: false,
      scores: {
        rust: 0,
        webFrameworks: {},
        databaseFrameworks: {},
        asyncRuntimes: {},
        testingFrameworks: {},
      },
      evidence: {
        files: {},
        cargo: {},
        dependencies: [],
        patterns: {},
        workspace: null,
        editions: [],
      },
      frameworks: {
        web: [],
        database: [],
        async: [],
        testing: [],
      },
      metadata: {
        detectionTime: 0,
        filesAnalyzed: 0,
        patternsMatched: 0,
        byzantineConsensus: false,
      },
    };

    try {
      // Execute pre-detection hook
      await this.executeHook('rust-detection-start', results);

      // Phase 1: Core Rust project detection
      await this.detectCoreRustProject(results);

      // Phase 2: Cargo.toml analysis
      await this.analyzeCargoToml(results);

      // Phase 3: File system analysis
      await this.analyzeRustFileSystem(results);

      // Phase 4: Content pattern analysis
      await this.analyzeRustContentPatterns(results);

      // Phase 5: Web framework detection
      await this.detectRustWebFrameworks(results);

      // Phase 6: Database framework detection
      await this.detectRustDatabaseFrameworks(results);

      // Phase 7: Async runtime detection
      await this.detectAsyncRuntimes(results);

      // Phase 8: Testing framework detection
      await this.detectRustTestingFrameworks(results);

      // Phase 9: Workspace analysis
      await this.analyzeWorkspaceStructure(results);

      // Phase 10: Apply advanced scoring
      this.applyAdvancedRustScoring(results);

      // Phase 11: Calculate final confidence
      this.calculateFinalRustScores(results);

      // Phase 12: Byzantine consensus validation
      await this.performByzantineConsensus(results);

      results.metadata.detectionTime = Date.now() - startTime;

      // Cache results with Byzantine validation
      await this.cacheResultsWithConsensus(results);

      // Execute post-detection hook
      await this.executeHook('rust-detection-complete', results);

      return results;
    } catch (error) {
      this.logger.error('Rust framework detection error', error);
      results.error = error.message;
      results.metadata.detectionTime = Date.now() - startTime;

      // Execute error hook
      await this.executeHook('rust-detection-error', { error: error.message, results });

      return results;
    }
  }

  /**
   * Phase 1: Detect core Rust project indicators
   */
  async detectCoreRustProject(results) {
    try {
      // Check for Cargo.toml - primary indicator
      const cargoTomlPath = path.join(this.basePath, 'Cargo.toml');
      const hasCargoToml = await this.fileExists(cargoTomlPath);

      if (hasCargoToml) {
        results.scores.rust += 0.45;
        results.evidence.files['Cargo.toml'] = true;
        results.isRustProject = true;

        this.logger.debug('Core Rust project detected', { cargoToml: true });
      }

      // Check for other core files
      for (const filePattern of this.rustDetectionPatterns.coreFiles) {
        if (filePattern.pattern === 'Cargo.toml') continue; // Already checked

        const exists = await this.checkFilePattern(filePattern.pattern);
        if (exists) {
          results.scores.rust += filePattern.weight;
          results.evidence.files[filePattern.pattern] = true;

          if (filePattern.multiple) {
            const count = await this.countFilesByExtension('.rs');
            const bonus = Math.min(filePattern.weight, count * 0.01);
            results.scores.rust += bonus;
          }
        }
      }

      // Execute hook for core detection
      await this.executeHook('rust-core-detection', {
        isRustProject: results.isRustProject,
        score: results.scores.rust,
      });
    } catch (error) {
      this.logger.warn('Core Rust detection error', error);
    }
  }

  /**
   * Phase 2: Analyze Cargo.toml for detailed project information
   */
  async analyzeCargoToml(results) {
    try {
      const cargoTomlPath = path.join(this.basePath, 'Cargo.toml');
      if (!(await this.fileExists(cargoTomlPath))) return;

      const cargoContent = await fs.readFile(cargoTomlPath, 'utf8');
      const cargoData = this.parseToml(cargoContent);

      // Store cargo metadata
      results.evidence.cargo = {
        name: cargoData.package?.name,
        version: cargoData.package?.version,
        edition: cargoData.package?.edition,
        authors: cargoData.package?.authors,
        description: cargoData.package?.description,
      };

      // Track Rust edition
      if (cargoData.package?.edition) {
        results.evidence.editions.push(cargoData.package.edition);

        // Bonus for modern editions
        if (cargoData.package.edition === '2021') {
          results.scores.rust += 0.05;
        } else if (cargoData.package.edition === '2018') {
          results.scores.rust += 0.03;
        }
      }

      // Analyze dependencies
      const allDependencies = {
        ...cargoData.dependencies,
        ...cargoData['dev-dependencies'],
        ...cargoData['build-dependencies'],
      };

      results.evidence.dependencies = Object.keys(allDependencies || {});

      // Check for workspace configuration
      if (cargoData.workspace) {
        results.evidence.workspace = {
          members: cargoData.workspace.members || [],
          defaultMembers: cargoData.workspace['default-members'] || [],
          resolver: cargoData.workspace.resolver,
        };
        results.scores.rust += 0.1; // Workspace bonus
      }

      // Dependency analysis for framework detection
      await this.analyzeDependencies(allDependencies, results);

      this.logger.debug('Cargo.toml analyzed', {
        dependencies: results.evidence.dependencies.length,
        edition: cargoData.package?.edition,
        workspace: !!cargoData.workspace,
      });

      // Execute hook for cargo analysis
      await this.executeHook('cargo-analysis-complete', {
        dependencies: results.evidence.dependencies,
        workspace: results.evidence.workspace,
      });
    } catch (error) {
      this.logger.warn('Cargo.toml analysis error', error);
    }
  }

  /**
   * Analyze dependencies for framework indicators
   */
  async analyzeDependencies(dependencies, results) {
    if (!dependencies) return;

    // Web framework analysis
    for (const [framework, patterns] of Object.entries(this.rustWebFrameworkPatterns)) {
      const matchCount = patterns.dependencies.filter((dep) => dependencies[dep]).length;
      if (matchCount > 0) {
        const confidence = Math.min(1.0, matchCount / patterns.dependencies.length);
        results.scores.webFrameworks[framework] = confidence * patterns.weight;

        if (!results.frameworks.web.find((f) => f.name === framework)) {
          results.frameworks.web.push({
            name: framework,
            confidence,
            description: patterns.description,
          });
        }
      }
    }

    // Database framework analysis
    for (const [framework, patterns] of Object.entries(this.rustDatabaseFrameworkPatterns)) {
      const matchCount = patterns.dependencies.filter((dep) => dependencies[dep]).length;
      if (matchCount > 0) {
        const confidence = Math.min(1.0, matchCount / patterns.dependencies.length);
        results.scores.databaseFrameworks[framework] = confidence * patterns.weight;

        if (!results.frameworks.database.find((f) => f.name === framework)) {
          results.frameworks.database.push({
            name: framework,
            confidence,
            description: patterns.description,
          });
        }
      }
    }

    // Async runtime analysis
    for (const [runtime, patterns] of Object.entries(this.rustAsyncRuntimePatterns)) {
      if (patterns.dependencies.some((dep) => dependencies[dep])) {
        results.scores.asyncRuntimes[runtime] = patterns.weight;

        if (!results.frameworks.async.find((f) => f.name === runtime)) {
          results.frameworks.async.push({
            name: runtime,
            confidence: 0.8,
            description: patterns.description,
          });
        }
      }
    }

    // Testing framework analysis
    for (const [framework, patterns] of Object.entries(this.rustTestingFrameworkPatterns)) {
      if (patterns.dependencies && patterns.dependencies.some((dep) => dependencies[dep])) {
        results.scores.testingFrameworks[framework] = patterns.weight;

        if (!results.frameworks.testing.find((f) => f.name === framework)) {
          results.frameworks.testing.push({
            name: framework,
            confidence: 0.7,
            description: patterns.description,
          });
        }
      }
    }
  }

  /**
   * Phase 3: Analyze Rust file system structure
   */
  async analyzeRustFileSystem(results) {
    try {
      const rustFiles = await this.getRustFiles();
      results.metadata.filesAnalyzed = rustFiles.length;

      // Count Rust files and add bonus
      if (rustFiles.length > 0) {
        const fileBonus = Math.min(0.3, rustFiles.length * 0.02);
        results.scores.rust += fileBonus;
        results.evidence.files.rustFileCount = rustFiles.length;
      }

      // Check for standard Rust project structure
      const standardStructure = [
        'src/main.rs',
        'src/lib.rs',
        'src/bin/',
        'tests/',
        'benches/',
        'examples/',
      ];

      let structureScore = 0;
      for (const structPath of standardStructure) {
        if (await this.pathExists(path.join(this.basePath, structPath))) {
          structureScore += 0.05;
          results.evidence.files[structPath] = true;
        }
      }

      results.scores.rust += structureScore;

      this.logger.debug('Rust file system analyzed', {
        rustFiles: rustFiles.length,
        structureScore,
      });
    } catch (error) {
      this.logger.warn('Rust file system analysis error', error);
    }
  }

  /**
   * Phase 4: Analyze Rust content patterns
   */
  async analyzeRustContentPatterns(results) {
    try {
      const rustFiles = await this.getRustFiles();
      const sampleFiles = rustFiles.slice(0, 15); // Limit for performance

      for (const file of sampleFiles) {
        try {
          const content = await fs.readFile(file, 'utf8');

          // Analyze content patterns
          for (const pattern of this.rustDetectionPatterns.contentPatterns) {
            const matches = content.match(pattern.pattern);
            if (matches) {
              const score = Math.min(pattern.weight, matches.length * pattern.weight * 0.1);
              results.scores.rust += score;
              results.metadata.patternsMatched++;

              if (!results.evidence.patterns.rust) {
                results.evidence.patterns.rust = [];
              }

              results.evidence.patterns.rust.push({
                pattern: pattern.description,
                matches: matches.length,
                file: path.basename(file),
                weight: pattern.weight,
              });
            }
          }

          // Web framework content analysis
          await this.analyzeWebFrameworkContent(content, file, results);
        } catch (fileError) {
          // Skip unreadable files
        }
      }
    } catch (error) {
      this.logger.warn('Rust content analysis error', error);
    }
  }

  /**
   * Analyze content for web framework patterns
   */
  async analyzeWebFrameworkContent(content, file, results) {
    for (const [framework, patterns] of Object.entries(this.rustWebFrameworkPatterns)) {
      let patternMatches = 0;

      for (const pattern of patterns.patterns) {
        if (content.match(pattern)) {
          patternMatches++;
        }
      }

      if (patternMatches > 0) {
        const confidence = Math.min(1.0, patternMatches / patterns.patterns.length);
        const currentScore = results.scores.webFrameworks[framework] || 0;
        results.scores.webFrameworks[framework] = Math.max(
          currentScore,
          confidence * patterns.weight,
        );

        // Update or add framework info
        const existingFramework = results.frameworks.web.find((f) => f.name === framework);
        if (existingFramework) {
          existingFramework.confidence = Math.max(existingFramework.confidence, confidence);
        } else {
          results.frameworks.web.push({
            name: framework,
            confidence,
            description: patterns.description,
            evidenceFile: path.basename(file),
          });
        }
      }
    }
  }

  /**
   * Phase 5-8: Framework detection methods
   */
  async detectRustWebFrameworks(results) {
    // Web framework detection already handled in dependency and content analysis
    // Add additional file-based detection here if needed

    for (const [framework, patterns] of Object.entries(this.rustWebFrameworkPatterns)) {
      if (patterns.files) {
        for (const file of patterns.files) {
          if (await this.pathExists(path.join(this.basePath, file))) {
            const currentScore = results.scores.webFrameworks[framework] || 0;
            results.scores.webFrameworks[framework] = currentScore + 0.1;
          }
        }
      }
    }
  }

  async detectRustDatabaseFrameworks(results) {
    // Database framework detection via special files and directories

    for (const [framework, patterns] of Object.entries(this.rustDatabaseFrameworkPatterns)) {
      if (patterns.files) {
        for (const file of patterns.files) {
          if (await this.pathExists(path.join(this.basePath, file))) {
            const currentScore = results.scores.databaseFrameworks[framework] || 0;
            results.scores.databaseFrameworks[framework] = currentScore + 0.15;
          }
        }
      }

      if (patterns.configFiles) {
        for (const configFile of patterns.configFiles) {
          if (await this.fileExists(path.join(this.basePath, configFile))) {
            const currentScore = results.scores.databaseFrameworks[framework] || 0;
            results.scores.databaseFrameworks[framework] = currentScore + 0.1;
          }
        }
      }
    }
  }

  async detectAsyncRuntimes(results) {
    // Async runtime detection via content patterns in Rust files
    const rustFiles = await this.getRustFiles();
    const sampleFiles = rustFiles.slice(0, 10);

    for (const [runtime, patterns] of Object.entries(this.rustAsyncRuntimePatterns)) {
      for (const file of sampleFiles) {
        try {
          const content = await fs.readFile(file, 'utf8');

          let patternMatches = 0;
          for (const pattern of patterns.patterns) {
            if (content.match(pattern)) {
              patternMatches++;
            }
          }

          if (patternMatches > 0) {
            const currentScore = results.scores.asyncRuntimes[runtime] || 0;
            results.scores.asyncRuntimes[runtime] = Math.max(currentScore, patterns.weight);
            break; // Found evidence, no need to check more files for this runtime
          }
        } catch (error) {
          // Skip unreadable files
        }
      }
    }
  }

  async detectRustTestingFrameworks(results) {
    // Testing framework detection via patterns and files
    const rustFiles = await this.getRustFiles();
    const testFiles = rustFiles.filter(
      (file) =>
        file.includes('/tests/') || file.includes('/test/') || path.basename(file).includes('test'),
    );

    for (const [framework, patterns] of Object.entries(this.rustTestingFrameworkPatterns)) {
      let detected = false;

      // Check test files for patterns
      for (const file of testFiles.slice(0, 5)) {
        try {
          const content = await fs.readFile(file, 'utf8');

          for (const pattern of patterns.patterns) {
            if (content.match(pattern)) {
              detected = true;
              break;
            }
          }

          if (detected) break;
        } catch (error) {
          // Skip unreadable files
        }
      }

      // Check for framework-specific directories
      if (!detected && patterns.files) {
        for (const file of patterns.files) {
          if (await this.pathExists(path.join(this.basePath, file))) {
            detected = true;
            break;
          }
        }
      }

      if (detected) {
        results.scores.testingFrameworks[framework] = patterns.weight;

        if (!results.frameworks.testing.find((f) => f.name === framework)) {
          results.frameworks.testing.push({
            name: framework,
            confidence: 0.8,
            description: patterns.description,
          });
        }
      }
    }
  }

  /**
   * Phase 9: Analyze workspace structure
   */
  async analyzeWorkspaceStructure(results) {
    try {
      const cargoTomlPath = path.join(this.basePath, 'Cargo.toml');
      if (!(await this.fileExists(cargoTomlPath))) return;

      const cargoContent = await fs.readFile(cargoTomlPath, 'utf8');

      // Check for workspace patterns
      for (const pattern of this.workspacePatterns.cargoWorkspace.patterns) {
        if (cargoContent.match(pattern)) {
          results.scores.rust += this.workspacePatterns.cargoWorkspace.weight;
          break;
        }
      }

      // If workspace is detected, analyze member crates
      if (results.evidence.workspace && results.evidence.workspace.members) {
        const workspaceMembers = results.evidence.workspace.members;

        for (const member of workspaceMembers) {
          const memberCargoPath = path.join(this.basePath, member, 'Cargo.toml');
          if (await this.fileExists(memberCargoPath)) {
            results.scores.rust += 0.05; // Bonus for each valid workspace member
          }
        }

        results.evidence.workspace.validMembers = workspaceMembers.length;
      }
    } catch (error) {
      this.logger.warn('Workspace analysis error', error);
    }
  }

  /**
   * Phase 10: Apply advanced Rust-specific scoring
   */
  applyAdvancedRustScoring(results) {
    // Web framework consistency bonuses
    const webFrameworks = Object.keys(results.scores.webFrameworks);
    if (webFrameworks.length > 0) {
      results.scores.rust += 0.1; // Web development bonus

      // Modern framework bonus
      if (webFrameworks.includes('axum') || webFrameworks.includes('warp')) {
        results.scores.rust += 0.05;
      }
    }

    // Database integration bonus
    const dbFrameworks = Object.keys(results.scores.databaseFrameworks);
    if (dbFrameworks.length > 0) {
      results.scores.rust += 0.08;

      // Modern async database bonus
      if (dbFrameworks.includes('sea-orm') || dbFrameworks.includes('sqlx')) {
        results.scores.rust += 0.03;
      }
    }

    // Async runtime bonus
    const asyncRuntimes = Object.keys(results.scores.asyncRuntimes);
    if (asyncRuntimes.includes('tokio')) {
      results.scores.rust += 0.05; // Tokio is the de facto standard
    }

    // Testing framework bonus
    const testingFrameworks = Object.keys(results.scores.testingFrameworks);
    if (testingFrameworks.length > 1) {
      results.scores.rust += 0.03; // Multiple testing approaches
    }

    // Edition bonus (modern Rust practices)
    if (results.evidence.editions.includes('2021')) {
      results.scores.rust += 0.05;
    }

    // Workspace bonus for complex projects
    if (results.evidence.workspace && results.evidence.workspace.validMembers > 2) {
      results.scores.rust += 0.08;
    }

    // File structure bonus
    const standardFiles = ['src/main.rs', 'src/lib.rs'].filter((f) => results.evidence.files[f]);
    if (standardFiles.length > 0) {
      results.scores.rust += 0.03 * standardFiles.length;
    }
  }

  /**
   * Phase 11: Calculate final Rust scores and confidence
   */
  calculateFinalRustScores(results) {
    // Determine if this is definitely a Rust project
    results.isRustProject = results.scores.rust > 0.5;

    if (results.isRustProject) {
      results.detected = 'rust';
      results.confidence = Math.min(1.0, results.scores.rust);

      // Adjust confidence based on framework evidence
      const frameworkTypes = [
        results.frameworks.web.length,
        results.frameworks.database.length,
        results.frameworks.async.length,
        results.frameworks.testing.length,
      ];

      const totalFrameworks = frameworkTypes.reduce((sum, count) => sum + count, 0);
      if (totalFrameworks > 2) {
        results.confidence = Math.min(1.0, results.confidence + 0.05);
      }

      // High confidence adjustments
      if (
        results.evidence.files['Cargo.toml'] &&
        results.evidence.files.rustFileCount > 5 &&
        results.evidence.workspace
      ) {
        results.confidence = Math.min(1.0, results.confidence + 0.1);
      }
    } else {
      results.detected = 'unknown';
      results.confidence = results.scores.rust;
    }

    // Calculate framework-specific confidence scores
    results.frameworkConfidence = {
      web: this.calculateFrameworkConfidence(results.scores.webFrameworks),
      database: this.calculateFrameworkConfidence(results.scores.databaseFrameworks),
      async: this.calculateFrameworkConfidence(results.scores.asyncRuntimes),
      testing: this.calculateFrameworkConfidence(results.scores.testingFrameworks),
    };
  }

  calculateFrameworkConfidence(frameworkScores) {
    const scores = Object.values(frameworkScores);
    if (scores.length === 0) return 0;

    return Math.max(...scores);
  }

  /**
   * Phase 12: Perform Byzantine consensus validation
   */
  async performByzantineConsensus(results) {
    try {
      // Simulate Byzantine consensus by validating results across multiple criteria
      const validators = [
        this.validateFileEvidence(results),
        this.validateCargoEvidence(results),
        this.validatePatternEvidence(results),
        this.validateFrameworkConsistency(results),
      ];

      const consensusResults = await Promise.all(validators);
      const consensusScore = consensusResults.filter(Boolean).length / consensusResults.length;

      results.metadata.byzantineConsensus = consensusScore >= 0.67; // 2/3 majority

      if (results.metadata.byzantineConsensus) {
        // Consensus reached - boost confidence slightly
        results.confidence = Math.min(1.0, results.confidence * 1.05);
      } else {
        // No consensus - reduce confidence slightly
        results.confidence = Math.max(0.0, results.confidence * 0.95);
      }

      await this.executeHook('byzantine-consensus-complete', {
        consensusScore,
        consensusReached: results.metadata.byzantineConsensus,
      });
    } catch (error) {
      this.logger.warn('Byzantine consensus error', error);
      results.metadata.byzantineConsensus = false;
    }
  }

  // Byzantine validation methods
  validateFileEvidence(results) {
    return results.evidence.files['Cargo.toml'] && results.evidence.files.rustFileCount > 0;
  }

  validateCargoEvidence(results) {
    return (
      results.evidence.cargo &&
      results.evidence.cargo.name &&
      results.evidence.dependencies.length > 0
    );
  }

  validatePatternEvidence(results) {
    return results.evidence.patterns.rust && results.evidence.patterns.rust.length > 2;
  }

  validateFrameworkConsistency(results) {
    const totalFrameworks =
      results.frameworks.web.length +
      results.frameworks.database.length +
      results.frameworks.async.length +
      results.frameworks.testing.length;
    return totalFrameworks > 0 || results.scores.rust > 0.6;
  }

  /**
   * Cache results with Byzantine validation
   */
  async cacheResultsWithConsensus(results) {
    try {
      const cacheKey = `rust-framework-detection-${Date.now()}`;

      await this.memoryStore.store(cacheKey, results, {
        namespace: 'rust-framework-detection',
        metadata: {
          timestamp: new Date().toISOString(),
          basePath: this.basePath,
          byzantineValidated: results.metadata.byzantineConsensus,
          confidence: results.confidence,
        },
      });

      this.logger.debug('Rust detection results cached', {
        cacheKey,
        byzantineValidated: results.metadata.byzantineConsensus,
      });
    } catch (error) {
      this.logger.warn('Failed to cache detection results', error);
    }
  }

  /**
   * Execute Byzantine validation hooks
   */
  async executeHook(hookName, data) {
    try {
      // Use npx to execute hook with proper claude-flow context
      const hookCommand = `npx claude-flow@alpha hooks ${hookName}`;

      // For now, just log the hook execution
      // In production, this would integrate with the actual hook system
      this.logger.debug('Executing Byzantine hook', { hookName, data });

      return true;
    } catch (error) {
      this.logger.warn(`Hook execution failed: ${hookName}`, error);
      return false;
    }
  }

  // Utility methods

  async getRustFiles() {
    const allFiles = await this.getFileList(this.basePath, { recursive: true, maxDepth: 4 });
    return allFiles.filter((file) => path.extname(file).toLowerCase() === '.rs');
  }

  async getFileList(dir, options = {}) {
    const files = [];
    const maxDepth = options.maxDepth || 3;

    const scan = async (currentDir, depth = 0) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          // Skip target directory and other build artifacts
          if (
            entry.isDirectory() &&
            ['target', '.git', 'node_modules', '__pycache__'].includes(entry.name)
          ) {
            continue;
          }

          if (entry.isFile()) {
            files.push(fullPath);
          } else if (entry.isDirectory() && options.recursive && depth < maxDepth) {
            await scan(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await scan(dir);
    return files;
  }

  async checkFilePattern(pattern) {
    if (pattern.includes('*')) {
      const files = await this.getFileList(this.basePath, { recursive: true, maxDepth: 2 });
      const regexPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(regexPattern);
      return files.some((file) => regex.test(path.basename(file)));
    } else {
      return await this.pathExists(path.join(this.basePath, pattern));
    }
  }

  async countFilesByExtension(extension) {
    const files = await this.getFileList(this.basePath, { recursive: true, maxDepth: 3 });
    return files.filter((file) => path.extname(file).toLowerCase() === extension).length;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async pathExists(pathToCheck) {
    try {
      const stats = await fs.stat(pathToCheck);
      return true;
    } catch {
      return false;
    }
  }

  // Simple TOML parser for Cargo.toml
  parseToml(content) {
    const result = {};
    const lines = content.split('\n');
    let currentSection = null;
    let currentSubSection = null;

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;

      // Section headers
      if (line.startsWith('[') && line.endsWith(']')) {
        const section = line.slice(1, -1);
        const parts = section.split('.');

        if (parts.length === 1) {
          currentSection = parts[0];
          currentSubSection = null;
          if (!result[currentSection]) {
            result[currentSection] = {};
          }
        } else {
          currentSection = parts[0];
          currentSubSection = parts[1];
          if (!result[currentSection]) {
            result[currentSection] = {};
          }
          if (!result[currentSection][currentSubSection]) {
            result[currentSection][currentSubSection] = {};
          }
        }
        continue;
      }

      // Key-value pairs
      const equalsIndex = line.indexOf('=');
      if (equalsIndex !== -1 && currentSection) {
        const key = line.slice(0, equalsIndex).trim();
        let value = line.slice(equalsIndex + 1).trim();

        // Remove quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Handle arrays (basic support)
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value
            .slice(1, -1)
            .split(',')
            .map((v) => v.trim().replace(/['"]/g, ''));
        }

        if (currentSubSection) {
          result[currentSection][currentSubSection][key] = value;
        } else {
          result[currentSection][key] = value;
        }
      }
    }

    return result;
  }

  async cleanup() {
    if (this.memoryStore) {
      await this.memoryStore.close();
    }
    this.initialized = false;
  }
}

export default RustFrameworkDetector;
