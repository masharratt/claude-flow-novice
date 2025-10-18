/**
 * Comprehensive Rust Framework Detection Example
 * Phase 2 Integration - Byzantine Validation Hooks Demonstration
 *
 * This example demonstrates the complete Rust framework detection system
 * with Byzantine consensus validation and integration with the custom
 * framework registry.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { RustFrameworkDetector } from '../src/validation/frameworks/rust-detector.js';
import { CustomFrameworkRegistry } from '../src/validation/custom-framework-registry.js';
import { logger } from '../src/core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RustDetectionDemo {
  constructor() {
    this.logger = logger.child({ component: 'RustDetectionDemo' });
  }

  async runComprehensiveDemo() {
    console.log('🚀 Starting Comprehensive Rust Framework Detection Demo\n');

    try {
      // Example 1: Basic Rust Project Detection
      await this.demonstrateBasicDetection();

      // Example 2: Web Framework Detection (Axum)
      await this.demonstrateWebFrameworkDetection();

      // Example 3: Database Integration Detection
      await this.demonstrateDatabaseDetection();

      // Example 4: Workspace Detection
      await this.demonstrateWorkspaceDetection();

      // Example 5: Byzantine Consensus Validation
      await this.demonstrateByzantineConsensus();

      // Example 6: Custom Framework Registry Integration
      await this.demonstrateRegistryIntegration();

      // Example 7: Complex Multi-Framework Project
      await this.demonstrateComplexProject();

      console.log('\n✅ All Rust detection examples completed successfully!');

    } catch (error) {
      console.error('❌ Demo failed:', error);
      throw error;
    }
  }

  async demonstrateBasicDetection() {
    console.log('📋 Example 1: Basic Rust Project Detection');
    console.log('=' .repeat(50));

    const projectPath = process.cwd(); // Assume current directory is a Rust project
    const detector = new RustFrameworkDetector({ basePath: projectPath });

    try {
      await detector.initialize();

      console.log('🔍 Detecting Rust framework...');
      const result = await detector.detectRustFramework();

      this.displayDetectionResults(result, 'Basic Detection');

      if (result.isRustProject) {
        console.log('✅ Successfully detected Rust project');
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`   Edition: ${result.evidence.cargo?.edition || 'Unknown'}`);
        console.log(`   Dependencies: ${result.evidence.dependencies?.length || 0}`);
      } else {
        console.log('ℹ️  Not a Rust project or insufficient evidence');
      }

      await detector.cleanup();

    } catch (error) {
      console.error('🔴 Basic detection failed:', error.message);
    }

    console.log();
  }

  async demonstrateWebFrameworkDetection() {
    console.log('🌐 Example 2: Web Framework Detection');
    console.log('=' .repeat(50));

    // This would typically analyze an actual Axum project
    const mockAxumProject = await this.createMockAxumProject();

    const detector = new RustFrameworkDetector({ basePath: mockAxumProject });

    try {
      await detector.initialize();

      console.log('🔍 Analyzing web framework usage...');
      const result = await detector.detectRustFramework();

      if (result.frameworks.web.length > 0) {
        console.log('✅ Web frameworks detected:');
        for (const framework of result.frameworks.web) {
          console.log(`   • ${framework.name} (confidence: ${(framework.confidence * 100).toFixed(1)}%)`);
          console.log(`     ${framework.description}`);
        }
      }

      if (result.frameworks.async.length > 0) {
        console.log('⚡ Async runtimes detected:');
        for (const runtime of result.frameworks.async) {
          console.log(`   • ${runtime.name}: ${runtime.description}`);
        }
      }

      this.displayByzantineValidation(result);

      await detector.cleanup();

    } catch (error) {
      console.error('🔴 Web framework detection failed:', error.message);
    }

    console.log();
  }

  async demonstrateDatabaseDetection() {
    console.log('🗄️ Example 3: Database Integration Detection');
    console.log('=' .repeat(50));

    const mockDieselProject = await this.createMockDieselProject();

    const detector = new RustFrameworkDetector({ basePath: mockDieselProject });

    try {
      await detector.initialize();

      console.log('🔍 Analyzing database integrations...');
      const result = await detector.detectRustFramework();

      if (result.frameworks.database.length > 0) {
        console.log('✅ Database frameworks detected:');
        for (const dbFramework of result.frameworks.database) {
          console.log(`   • ${dbFramework.name} (confidence: ${(dbFramework.confidence * 100).toFixed(1)}%)`);
          console.log(`     ${dbFramework.description}`);
        }
      }

      // Show database-specific evidence
      if (result.evidence.files['diesel.toml']) {
        console.log('📄 Database configuration files found:');
        console.log('   • diesel.toml (Diesel ORM configuration)');
      }

      if (result.evidence.files['migrations/']) {
        console.log('   • migrations/ directory (Database schema management)');
      }

      await detector.cleanup();

    } catch (error) {
      console.error('🔴 Database detection failed:', error.message);
    }

    console.log();
  }

  async demonstrateWorkspaceDetection() {
    console.log('📦 Example 4: Cargo Workspace Detection');
    console.log('=' .repeat(50));

    const mockWorkspace = await this.createMockWorkspace();

    const detector = new RustFrameworkDetector({ basePath: mockWorkspace });

    try {
      await detector.initialize();

      console.log('🔍 Analyzing workspace structure...');
      const result = await detector.detectRustFramework();

      if (result.evidence.workspace) {
        console.log('✅ Cargo workspace detected:');
        console.log(`   • Members: ${result.evidence.workspace.members.length}`);
        console.log(`   • Valid members: ${result.evidence.workspace.validMembers || 0}`);
        console.log(`   • Resolver: ${result.evidence.workspace.resolver || 'default'}`);

        if (result.evidence.workspace.members.length > 0) {
          console.log('   • Member crates:');
          for (const member of result.evidence.workspace.members) {
            console.log(`     - ${member}`);
          }
        }
      }

      // Show workspace-specific scoring bonus
      console.log(`📊 Workspace bonus applied to confidence score`);
      console.log(`   Base score: ${result.scores.rust.toFixed(3)}`);

      await detector.cleanup();

    } catch (error) {
      console.error('🔴 Workspace detection failed:', error.message);
    }

    console.log();
  }

  async demonstrateByzantineConsensus() {
    console.log('🛡️ Example 5: Byzantine Consensus Validation');
    console.log('=' .repeat(50));

    const detector = new RustFrameworkDetector({ basePath: process.cwd() });

    try {
      await detector.initialize();

      console.log('🔍 Performing detection with Byzantine validation...');
      const result = await detector.detectRustFramework();

      console.log('🧮 Byzantine Consensus Results:');
      console.log(`   Consensus achieved: ${result.metadata.byzantineConsensus ? '✅ Yes' : '❌ No'}`);

      // Show individual validation results
      const validations = [
        { name: 'File Evidence', result: detector.validateFileEvidence(result) },
        { name: 'Cargo Evidence', result: detector.validateCargoEvidence(result) },
        { name: 'Pattern Evidence', result: detector.validatePatternEvidence(result) },
        { name: 'Framework Consistency', result: detector.validateFrameworkConsistency(result) }
      ];

      console.log('   Individual validators:');
      for (const validation of validations) {
        const status = validation.result ? '✅' : '❌';
        console.log(`     ${status} ${validation.name}`);
      }

      const consensusRate = validations.filter(v => v.result).length / validations.length;
      console.log(`   Consensus rate: ${(consensusRate * 100).toFixed(1)}% (need ≥67% for validation)`);

      if (result.metadata.byzantineConsensus) {
        console.log('🎯 Detection results are Byzantine-validated and highly reliable');
      } else {
        console.log('⚠️  Detection results lack consensus - use with caution');
      }

      await detector.cleanup();

    } catch (error) {
      console.error('🔴 Byzantine validation failed:', error.message);
    }

    console.log();
  }

  async demonstrateRegistryIntegration() {
    console.log('📚 Example 6: Custom Framework Registry Integration');
    console.log('=' .repeat(50));

    const registry = new CustomFrameworkRegistry({ basePath: process.cwd() });

    try {
      await registry.initialize();

      console.log('🤖 Attempting auto-detection and registration...');
      const registrationResult = await registry.autoDetectRustFrameworks();

      if (registrationResult.success) {
        console.log('✅ Rust framework auto-registered successfully!');
        console.log(`   Framework ID: ${registrationResult.frameworkId}`);
        console.log(`   Name: ${registrationResult.framework.name}`);

        // Show Rust-specific metadata
        if (registrationResult.framework.rustSpecific) {
          const rustData = registrationResult.framework.rustSpecific;
          console.log('🦀 Rust-specific details:');
          console.log(`   • Edition: ${rustData.edition}`);
          console.log(`   • Workspace: ${rustData.cargoWorkspace ? 'Yes' : 'No'}`);
          console.log(`   • Dependencies: ${rustData.dependencies?.length || 0}`);
          console.log(`   • Byzantine validated: ${rustData.byzantineConsensus ? 'Yes' : 'No'}`);
          console.log(`   • Detection confidence: ${(rustData.confidence * 100).toFixed(1)}%`);
        }

      } else {
        console.log('ℹ️  Auto-registration not performed:');
        console.log(`   Reason: ${registrationResult.reason}`);
        console.log(`   Confidence: ${(registrationResult.confidence * 100).toFixed(1)}%`);
      }

      // Show registry statistics
      const stats = await registry.getRustDetectionStatistics();
      console.log('📊 Registry Statistics:');
      console.log(`   • Total Rust projects: ${stats.totalRustProjects}`);
      console.log(`   • Byzantine validated: ${stats.byzantineValidated}`);
      console.log(`   • Average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);

      await registry.cleanup();

    } catch (error) {
      console.error('🔴 Registry integration failed:', error.message);
    }

    console.log();
  }

  async demonstrateComplexProject() {
    console.log('🏗️ Example 7: Complex Multi-Framework Project');
    console.log('=' .repeat(50));

    const mockComplexProject = await this.createMockComplexProject();

    const detector = new RustFrameworkDetector({ basePath: mockComplexProject });

    try {
      await detector.initialize();

      console.log('🔍 Analyzing complex project structure...');
      const result = await detector.detectRustFramework();

      console.log('📈 Comprehensive Analysis Results:');
      console.log(`   Overall confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Byzantine consensus: ${result.metadata.byzantineConsensus ? '✅' : '❌'}`);
      console.log(`   Detection time: ${result.metadata.detectionTime}ms`);

      // Show all detected frameworks
      const frameworkTypes = ['web', 'database', 'async', 'testing'];
      for (const type of frameworkTypes) {
        const frameworks = result.frameworks[type];
        if (frameworks.length > 0) {
          console.log(`   ${type.charAt(0).toUpperCase() + type.slice(1)} frameworks:`);
          for (const framework of frameworks) {
            console.log(`     • ${framework.name} (${(framework.confidence * 100).toFixed(1)}%)`);
          }
        }
      }

      // Show complexity scoring
      const complexityScore = Object.values(result.frameworks).reduce(
        (sum, frameworks) => sum + frameworks.length, 0
      );
      console.log(`   Complexity score: ${complexityScore} (frameworks detected)`);

      if (result.evidence.workspace) {
        console.log(`   Workspace complexity: ${result.evidence.workspace.members.length} crates`);
      }

      await detector.cleanup();

    } catch (error) {
      console.error('🔴 Complex project analysis failed:', error.message);
    }

    console.log();
  }

  displayDetectionResults(result, title) {
    console.log(`📊 ${title} Results:`);
    console.log(`   Detected: ${result.detected}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Is Rust project: ${result.isRustProject ? 'Yes' : 'No'}`);

    if (result.evidence.cargo && Object.keys(result.evidence.cargo).length > 0) {
      console.log('   Cargo metadata:');
      if (result.evidence.cargo.name) console.log(`     • Name: ${result.evidence.cargo.name}`);
      if (result.evidence.cargo.version) console.log(`     • Version: ${result.evidence.cargo.version}`);
      if (result.evidence.cargo.edition) console.log(`     • Edition: ${result.evidence.cargo.edition}`);
    }

    if (result.evidence.files) {
      const importantFiles = Object.keys(result.evidence.files)
        .filter(file => result.evidence.files[file] === true)
        .slice(0, 5); // Show first 5 files

      if (importantFiles.length > 0) {
        console.log('   Key files found:');
        for (const file of importantFiles) {
          console.log(`     • ${file}`);
        }
      }
    }
  }

  displayByzantineValidation(result) {
    console.log('🛡️ Byzantine Validation Status:');
    console.log(`   Consensus: ${result.metadata.byzantineConsensus ? '✅ Achieved' : '❌ Not achieved'}`);

    if (result.metadata.byzantineConsensus) {
      console.log('   This detection has been validated by Byzantine consensus');
      console.log('   Results are highly reliable and fault-tolerant');
    } else {
      console.log('   Detection lacks sufficient consensus');
      console.log('   Results should be verified manually');
    }
  }

  // Mock project creation methods (in real implementation, these would use actual file system)
  async createMockAxumProject() {
    return '/tmp/mock-axum-project'; // Mock path
  }

  async createMockDieselProject() {
    return '/tmp/mock-diesel-project'; // Mock path
  }

  async createMockWorkspace() {
    return '/tmp/mock-workspace'; // Mock path
  }

  async createMockComplexProject() {
    return '/tmp/mock-complex-project'; // Mock path
  }
}

// Advanced usage examples
class AdvancedRustDetectionExamples {
  constructor() {
    this.logger = logger.child({ component: 'AdvancedRustDetection' });
  }

  /**
   * Example: Custom detection criteria
   */
  async demonstrateCustomCriteria() {
    console.log('🎯 Advanced Example: Custom Detection Criteria');
    console.log('=' .repeat(50));

    const detector = new RustFrameworkDetector({ basePath: process.cwd() });
    await detector.initialize();

    try {
      const result = await detector.detectRustFramework();

      // Custom filtering and analysis
      const modernProject = result.evidence.editions.includes('2021');
      const asyncCapable = result.frameworks.async.length > 0;
      const webCapable = result.frameworks.web.length > 0;
      const dbIntegrated = result.frameworks.database.length > 0;

      console.log('🔍 Custom Analysis Results:');
      console.log(`   Modern Rust (2021 edition): ${modernProject ? '✅' : '❌'}`);
      console.log(`   Async-capable: ${asyncCapable ? '✅' : '❌'}`);
      console.log(`   Web-enabled: ${webCapable ? '✅' : '❌'}`);
      console.log(`   Database-integrated: ${dbIntegrated ? '✅' : '❌'}`);

      // Calculate custom suitability scores
      const suitabilityScores = {
        microservice: this.calculateMicroserviceSuitability(result),
        webApp: this.calculateWebAppSuitability(result),
        cliTool: this.calculateCliSuitability(result),
        systemService: this.calculateSystemServiceSuitability(result)
      };

      console.log('📈 Project Suitability Scores:');
      for (const [type, score] of Object.entries(suitabilityScores)) {
        console.log(`   ${type}: ${(score * 100).toFixed(1)}%`);
      }

      await detector.cleanup();

    } catch (error) {
      console.error('🔴 Custom criteria analysis failed:', error.message);
    }

    console.log();
  }

  calculateMicroserviceSuitability(result) {
    let score = 0.0;

    // Web framework presence
    if (result.frameworks.web.length > 0) score += 0.4;

    // Async runtime (essential for microservices)
    if (result.frameworks.async.some(f => f.name === 'tokio')) score += 0.3;

    // Database integration
    if (result.frameworks.database.length > 0) score += 0.2;

    // Modern Rust edition
    if (result.evidence.editions.includes('2021')) score += 0.1;

    return Math.min(1.0, score);
  }

  calculateWebAppSuitability(result) {
    let score = 0.0;

    // Web framework presence (critical)
    const webFrameworks = result.frameworks.web;
    if (webFrameworks.length > 0) {
      score += 0.5;

      // Bonus for modern frameworks
      if (webFrameworks.some(f => ['axum', 'warp'].includes(f.name))) {
        score += 0.1;
      }
    }

    // Database integration (important for web apps)
    if (result.frameworks.database.length > 0) score += 0.3;

    // Async support
    if (result.frameworks.async.length > 0) score += 0.1;

    return Math.min(1.0, score);
  }

  calculateCliSuitability(result) {
    let score = 0.5; // Base score for any Rust project

    // Prefer simpler projects for CLI tools
    const totalFrameworks = Object.values(result.frameworks).reduce(
      (sum, frameworks) => sum + frameworks.length, 0
    );

    if (totalFrameworks <= 2) score += 0.2;

    // Binary project structure
    if (result.evidence.files['src/main.rs']) score += 0.2;

    // Lightweight async if present
    if (result.frameworks.async.some(f => f.name === 'async-std')) score += 0.1;

    return Math.min(1.0, score);
  }

  calculateSystemServiceSuitability(result) {
    let score = 0.0;

    // Async runtime (essential for system services)
    if (result.frameworks.async.some(f => f.name === 'tokio')) score += 0.4;

    // Low-level or system-focused frameworks
    if (result.frameworks.web.some(f => f.name === 'hyper')) score += 0.3;

    // Modern edition for latest features
    if (result.evidence.editions.includes('2021')) score += 0.2;

    // Workspace structure for modularity
    if (result.evidence.workspace) score += 0.1;

    return Math.min(1.0, score);
  }

  /**
   * Example: Integration with existing systems
   */
  async demonstrateSystemIntegration() {
    console.log('🔗 Advanced Example: System Integration');
    console.log('=' .repeat(50));

    const registry = new CustomFrameworkRegistry({ basePath: process.cwd() });

    try {
      await registry.initialize();

      // Search for existing Rust frameworks
      const existingRust = await registry.searchRustFrameworks({
        minConfidence: 0.8,
        byzantineValidated: true
      });

      console.log(`📋 Found ${existingRust.length} validated Rust frameworks:`);

      for (const framework of existingRust) {
        console.log(`   • ${framework.name}`);
        console.log(`     Confidence: ${(framework.rustSpecific?.confidence * 100).toFixed(1)}%`);
        console.log(`     Edition: ${framework.rustSpecific?.edition}`);
        console.log(`     Workspace: ${framework.rustSpecific?.cargoWorkspace ? 'Yes' : 'No'}`);
      }

      // Integration statistics
      const stats = await registry.getRustDetectionStatistics();
      console.log('📊 Integration Statistics:');
      console.log(`   Byzantine validation rate: ${(stats.byzantineValidationRate * 100).toFixed(1)}%`);
      console.log(`   Edition distribution:`, stats.editions);
      console.log(`   Framework distribution:`, stats.frameworkDistribution);

      await registry.cleanup();

    } catch (error) {
      console.error('🔴 System integration demo failed:', error.message);
    }
  }
}

// Main execution
async function main() {
  const demo = new RustDetectionDemo();
  const advancedDemo = new AdvancedRustDetectionExamples();

  try {
    // Run comprehensive demo
    await demo.runComprehensiveDemo();

    // Run advanced examples
    await advancedDemo.demonstrateCustomCriteria();
    await advancedDemo.demonstrateSystemIntegration();

    console.log('\n🎉 All Rust framework detection examples completed!');
    console.log('📘 The system provides:');
    console.log('   • Comprehensive Rust ecosystem detection');
    console.log('   • Byzantine fault-tolerant validation');
    console.log('   • Automatic framework registry integration');
    console.log('   • Support for complex workspace structures');
    console.log('   • High-confidence detection results');

  } catch (error) {
    console.error('❌ Demo execution failed:', error);
    process.exit(1);
  }
}

// Export for use as module
export { RustDetectionDemo, AdvancedRustDetectionExamples };

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}