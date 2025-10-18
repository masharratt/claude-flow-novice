#!/usr/bin/env node

/**
 * Test Runner - Run multiple test files
 */

const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.results = {
      files: 0,
      tests: 0,
      passed: 0,
      failed: 0
    };
  }

  async runFiles(pattern = '*.test.js') {
    const files = this.findTestFiles(pattern);
    
    if (files.length === 0) {
      console.log('❌ No test files found');
      return this.results;
    }

    console.log(`🔍 Found ${files.length} test file(s)\n`);

    for (const file of files) {
      await this.runFile(file);
    }

    this.printSummary();
    return this.results;
  }

  findTestFiles(pattern) {
    const files = [];
    
    try {
      const dirFiles = fs.readdirSync('.');
      for (const file of dirFiles) {
        if (file.endsWith('.test.js') || file.endsWith('.spec.js')) {
          files.push(file);
        }
      }
    } catch (error) {
      console.error('Error reading directory:', error.message);
    }

    return files;
  }

  async runFile(filePath) {
    try {
      console.log(`📁 Running ${filePath}`);
      
      // Clear require cache to allow re-running
      delete require.cache[require.resolve(path.resolve(filePath))];
      
      const testModule = require(path.resolve(filePath));
      
      if (typeof testModule === 'function') {
        // Assume it's a test function
        const QuickTest = require('./quick-test');
        const qt = new QuickTest();
        testModule(qt);
        const results = await qt.run();
        
        this.aggregateResults(results);
      } else if (testModule && typeof testModule.run === 'function') {
        // Assume it's a QuickTest instance
        const results = await testModule.run();
        this.aggregateResults(results);
      }
      
      console.log('');
    } catch (error) {
      console.log(`❌ Failed to run ${filePath}: ${error.message}\n`);
      this.results.files++;
      this.results.failed++;
    }
  }

  aggregateResults(fileResults) {
    this.results.files++;
    this.results.tests += fileResults.total;
    this.results.passed += fileResults.passed;
    this.results.failed += fileResults.failed;
  }

  printSummary() {
    console.log('📊 Overall Results:');
    console.log(`   Files: ${this.results.files}`);
    console.log(`   Tests: ${this.results.tests}`);
    console.log(`   Passed: ${this.results.passed}`);
    console.log(`   Failed: ${this.results.failed}`);
    
    if (this.results.failed === 0) {
      console.log('🎉 All tests passed across all files!');
    } else {
      console.log(`❌ ${this.results.failed} test(s) failed across all files`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  const pattern = process.argv[2] || '*.test.js';
  runner.runFiles(pattern).catch(console.error);
}

module.exports = TestRunner;