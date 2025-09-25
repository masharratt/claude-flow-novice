/**
 * Rust Validation Demo
 * Demonstrates the integrated Rust validation in ProductionValidationSuite
 *
 * This demo shows:
 * - Rust project detection
 * - Cargo test execution
 * - Cargo build validation
 * - Rust quality checks (clippy, fmt, audit)
 * - Byzantine consensus validation
 * - <5% false completion rate compliance
 */

import { ProductionValidationSuite } from '../src/validation/production-validation-suite.js';
import { promises as fs } from 'fs';
import path from 'path';

async function demonstrateRustValidation() {
  console.log('🦀 Rust Validation Demo - ProductionValidationSuite Integration');
  console.log('==============================================================\n');

  try {
    // Create a sample Rust project for demonstration
    const rustProjectPath = await createSampleRustProject();
    console.log(`📁 Created sample Rust project at: ${rustProjectPath}\n`);

    // Initialize ProductionValidationSuite with Rust support
    const validationSuite = new ProductionValidationSuite({
      frameworks: ['rust'],  // Enable Rust validation
      realWorldValidators: ['build', 'performance'],
      enableByzantineValidation: true,
      falseCompletionRateThreshold: 0.05, // 5% target
      parallelValidation: true
    });

    console.log('🏭 ProductionValidationSuite Configuration:');
    console.log(`   Supported Frameworks: ${validationSuite.options.frameworks.join(', ')}`);
    console.log(`   Byzantine Validation: ${validationSuite.options.enableByzantineValidation}`);
    console.log(`   False Completion Threshold: ${validationSuite.options.falseCompletionRateThreshold * 100}%`);
    console.log(`   Parallel Validation: ${validationSuite.options.parallelValidation}\n`);

    // Demonstrate project detection
    console.log('🔍 Step 1: Rust Project Detection');
    console.log('----------------------------------');
    const projectSetup = await validationSuite.detectProjectSetup(rustProjectPath);

    console.log(`Runtime: ${projectSetup.runtime}`);
    console.log(`Project Type: ${projectSetup.projectType}`);
    console.log(`Package Manager: ${projectSetup.packageManager}`);
    console.log(`Detected Frameworks: ${projectSetup.detected.testFrameworks.join(', ')}`);
    console.log(`Detected Build Systems: ${projectSetup.detected.buildSystems.join(', ')}\n`);

    // Check if Rust toolchain is available
    const rustAvailable = await checkRustToolchain();

    if (rustAvailable) {
      console.log('✅ Rust toolchain detected - proceeding with full validation\n');

      // Demonstrate comprehensive validation
      console.log('🧪 Step 2: Comprehensive Production Validation');
      console.log('----------------------------------------------');

      const validationResult = await validationSuite.validateProduction(rustProjectPath, {
        rust: {
          features: null,
          allFeatures: false,
          noDefaultFeatures: false
        },
        build: {
          enableRustSupport: true
        }
      });

      console.log('📊 Validation Results:');
      console.log(`   Validation ID: ${validationResult.validationId}`);
      console.log(`   Overall Success: ${validationResult.overall.overallSuccess}`);
      console.log(`   Production Ready: ${validationResult.overall.productionReady}`);
      console.log(`   Quality Score: ${(validationResult.overall.qualityScore * 100).toFixed(1)}%`);

      if (validationResult.testFrameworks.results.rust) {
        const rustResults = validationResult.testFrameworks.results.rust;
        console.log(`\n🦀 Rust-Specific Results:`);
        console.log(`   Tests Run: ${rustResults.tests?.executed || 'N/A'}`);
        console.log(`   Tests Passed: ${rustResults.tests?.passed || 'N/A'}`);
        console.log(`   Build Success: ${rustResults.build?.success || 'N/A'}`);
        console.log(`   Quality Score: ${rustResults.overall?.qualityScore ? (rustResults.overall.qualityScore * 100).toFixed(1) + '%' : 'N/A'}`);
      }

      console.log(`\n🛡️ Byzantine Consensus:`);
      console.log(`   Consensus Achieved: ${validationResult.byzantineValidation.consensusAchieved}`);
      console.log(`   Validator Count: ${validationResult.byzantineValidation.validatorCount}`);
      console.log(`   Tampered Results: ${validationResult.byzantineValidation.tamperedResults}`);

      console.log(`\n📈 False Completion Rate:`);
      console.log(`   Current Rate: ${(validationResult.falseCompletionRate.currentRate * 100).toFixed(2)}%`);
      console.log(`   Target Rate: ${(validationResult.falseCompletionRate.targetRate * 100).toFixed(0)}%`);
      console.log(`   Meets Target: ${validationResult.falseCompletionRate.meetsTarget ? '✅' : '❌'}`);

      console.log(`\n⏱️ Performance:`);
      console.log(`   Total Execution Time: ${Math.round(validationResult.performance.executionTime)}ms`);
      console.log(`   Real Frameworks Used: ${validationResult.performance.realFrameworksUsed.join(', ')}`);

    } else {
      console.log('⚠️  Rust toolchain not available - demonstrating framework registration only\n');

      console.log('🔧 Step 2: Framework Registration Validation');
      console.log('--------------------------------------------');

      // Test framework registration without execution
      const rustFrameworkRegistered = validationSuite.testFrameworks.rust !== undefined;
      const rustInFrameworksList = validationSuite.options.frameworks.includes('rust');

      console.log(`Rust Framework Registered: ${rustFrameworkRegistered ? '✅' : '❌'}`);
      console.log(`Rust in Frameworks List: ${rustInFrameworksList ? '✅' : '❌'}`);
      console.log(`Available Frameworks: ${Object.keys(validationSuite.testFrameworks).join(', ')}`);

      if (rustFrameworkRegistered) {
        const rustFramework = validationSuite.testFrameworks.rust;
        console.log(`\n🦀 Rust Framework Capabilities:`);
        console.log(`   Execute Tests: ${typeof rustFramework.executeTests === 'function' ? '✅' : '❌'}`);
        console.log(`   Quality Checks: ${typeof rustFramework.executeRustQualityChecks === 'function' ? '✅' : '❌'}`);
        console.log(`   Byzantine Validation: ${rustFramework.options.enableByzantineValidation ? '✅' : '❌'}`);
        console.log(`   Timeout: ${rustFramework.options.timeout}ms`);
      }
    }

    // Clean up
    await fs.rm(rustProjectPath, { recursive: true, force: true });
    console.log(`\n🧹 Cleaned up sample project`);

    console.log('\n✅ Demo completed successfully!');

    return {
      success: true,
      rustToolchainAvailable: rustAvailable,
      projectSetup,
      integrationComplete: true
    };

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    throw error;
  }
}

/**
 * Create a sample Rust project for demonstration
 */
async function createSampleRustProject() {
  const projectDir = `/tmp/claude/rust-demo-${Date.now()}`;
  await fs.mkdir(projectDir, { recursive: true });

  // Create Cargo.toml
  const cargoToml = `[package]
name = "rust-demo"
version = "0.1.0"
edition = "2021"
authors = ["Claude Code Demo"]
description = "Sample Rust project for validation demo"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }

[dev-dependencies]
criterion = "0.4"

[[bench]]
name = "benchmarks"
harness = false
`;

  await fs.writeFile(path.join(projectDir, 'Cargo.toml'), cargoToml);

  // Create src directory and files
  const srcDir = path.join(projectDir, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  // Main application file
  const mainRs = `use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Person {
    name: String,
    age: u32,
    email: String,
}

impl Person {
    pub fn new(name: String, age: u32, email: String) -> Self {
        Person { name, age, email }
    }

    pub fn is_adult(&self) -> bool {
        self.age >= 18
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

#[tokio::main]
async fn main() {
    println!("🦀 Rust Demo Application");

    let person = Person::new(
        "Claude".to_string(),
        25,
        "claude@anthropic.com".to_string()
    );

    println!("Person: {:?}", person);
    println!("Is adult: {}", person.is_adult());

    match person.to_json() {
        Ok(json) => println!("JSON: {}", json),
        Err(e) => println!("JSON serialization failed: {}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_person_creation() {
        let person = Person::new(
            "Test User".to_string(),
            30,
            "test@example.com".to_string()
        );
        assert_eq!(person.name, "Test User");
        assert_eq!(person.age, 30);
        assert_eq!(person.email, "test@example.com");
    }

    #[test]
    fn test_is_adult() {
        let adult = Person::new("Adult".to_string(), 25, "adult@test.com".to_string());
        let minor = Person::new("Minor".to_string(), 16, "minor@test.com".to_string());

        assert!(adult.is_adult());
        assert!(!minor.is_adult());
    }

    #[test]
    fn test_json_serialization() {
        let person = Person::new(
            "JSON Test".to_string(),
            28,
            "json@test.com".to_string()
        );

        let json_result = person.to_json();
        assert!(json_result.is_ok());

        let json = json_result.unwrap();
        assert!(json.contains("JSON Test"));
        assert!(json.contains("28"));
        assert!(json.contains("json@test.com"));
    }
}
`;

  await fs.writeFile(path.join(srcDir, 'main.rs'), mainRs);

  // Create lib.rs for library functions
  const libRs = `//! Rust Demo Library
//!
//! This library provides utilities for the demo application.

pub mod math;
pub mod utils;

pub use math::*;
pub use utils::*;
`;

  await fs.writeFile(path.join(srcDir, 'lib.rs'), libRs);

  // Create math module
  const mathRs = `//! Math utilities

/// Add two numbers
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

/// Multiply two numbers
pub fn multiply(a: i32, b: i32) -> i32 {
    a * b
}

/// Calculate factorial
pub fn factorial(n: u32) -> u64 {
    match n {
        0 => 1,
        _ => (1..=n as u64).product(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
        assert_eq!(add(-1, 1), 0);
    }

    #[test]
    fn test_multiply() {
        assert_eq!(multiply(3, 4), 12);
        assert_eq!(multiply(0, 5), 0);
    }

    #[test]
    fn test_factorial() {
        assert_eq!(factorial(0), 1);
        assert_eq!(factorial(1), 1);
        assert_eq!(factorial(5), 120);
    }
}
`;

  await fs.writeFile(path.join(srcDir, 'math.rs'), mathRs);

  // Create utils module
  const utilsRs = `//! Utility functions

/// Reverse a string
pub fn reverse_string(input: &str) -> String {
    input.chars().rev().collect()
}

/// Check if string is palindrome
pub fn is_palindrome(input: &str) -> bool {
    let cleaned: String = input.to_lowercase().chars()
        .filter(|c| c.is_alphanumeric())
        .collect();
    cleaned == reverse_string(&cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverse_string() {
        assert_eq!(reverse_string("hello"), "olleh");
        assert_eq!(reverse_string(""), "");
        assert_eq!(reverse_string("a"), "a");
    }

    #[test]
    fn test_is_palindrome() {
        assert!(is_palindrome("racecar"));
        assert!(is_palindrome("A man a plan a canal Panama"));
        assert!(!is_palindrome("hello"));
        assert!(is_palindrome(""));
    }
}
`;

  await fs.writeFile(path.join(srcDir, 'utils.rs'), utilsRs);

  // Create integration tests
  const testsDir = path.join(projectDir, 'tests');
  await fs.mkdir(testsDir, { recursive: true });

  const integrationTest = `use rust_demo::{add, multiply, factorial, reverse_string, is_palindrome};

#[test]
fn integration_test_math_functions() {
    assert_eq!(add(10, 20), 30);
    assert_eq!(multiply(6, 7), 42);
    assert_eq!(factorial(4), 24);
}

#[test]
fn integration_test_string_functions() {
    assert_eq!(reverse_string("integration"), "noitagertni");
    assert!(is_palindrome("level"));
    assert!(!is_palindrome("integration"));
}
`;

  await fs.writeFile(path.join(testsDir, 'integration_test.rs'), integrationTest);

  return projectDir;
}

/**
 * Check if Rust toolchain is available
 */
async function checkRustToolchain() {
  try {
    const { exec } = await import('child_process');
    return new Promise((resolve) => {
      exec('rustc --version', (error) => {
        resolve(!error);
      });
    });
  } catch (error) {
    return false;
  }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateRustValidation()
    .then(result => {
      console.log('\n🎉 Demo Result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Demo Error:', error);
      process.exit(1);
    });
}

export { demonstrateRustValidation, createSampleRustProject, checkRustToolchain };