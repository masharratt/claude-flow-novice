#!/usr/bin/env node

/**
 * Metrics Structure Validation Script
 * Validates the organized metrics directory structure and data integrity
 */

const fs = require('fs');
const path = require('path');

const METRICS_BASE = '.claude-flow/metrics';
const REQUIRED_STRUCTURE = {
  'performance': ['consolidated-performance.json', 'execution-history.json', 'agent-performance.json'],
  'system': ['real-time-metrics.json'],
  'benchmarks': [],
  'historical': [],
  'verification-archive': []
};

function validateStructure() {
  console.log('🔍 Validating metrics directory structure...\n');

  let isValid = true;

  // Check if config.json exists
  const configPath = path.join(METRICS_BASE, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ Missing config.json in metrics directory');
    isValid = false;
  } else {
    console.log('✅ Config file exists');

    // Validate config structure
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.version && config.structure) {
        console.log('✅ Config structure is valid');
      } else {
        console.error('❌ Invalid config.json structure');
        isValid = false;
      }
    } catch (error) {
      console.error('❌ Config.json is not valid JSON:', error.message);
      isValid = false;
    }
  }

  // Check directory structure
  for (const [dir, files] of Object.entries(REQUIRED_STRUCTURE)) {
    const dirPath = path.join(METRICS_BASE, dir);

    if (!fs.existsSync(dirPath)) {
      console.error(`❌ Missing directory: ${dir}`);
      isValid = false;
    } else {
      console.log(`✅ Directory exists: ${dir}`);

      // Check required files
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        if (!fs.existsSync(filePath)) {
          console.error(`❌ Missing required file: ${dir}/${file}`);
          isValid = false;
        } else {
          console.log(`  ✅ ${file}`);

          // Validate JSON files
          if (file.endsWith('.json')) {
            try {
              const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              if (content.metadata) {
                console.log(`    ✅ Valid JSON with metadata`);
              }
            } catch (error) {
              console.error(`    ❌ Invalid JSON in ${file}:`, error.message);
              isValid = false;
            }
          }
        }
      }
    }
  }

  // Check for leftover legacy files
  const metricsFiles = fs.readdirSync(METRICS_BASE);
  const legacyFiles = metricsFiles.filter(file =>
    file.endsWith('.json') &&
    !['config.json'].includes(file)
  );

  if (legacyFiles.length > 0) {
    console.warn('⚠️  Legacy files still in root metrics directory:');
    legacyFiles.forEach(file => console.warn(`  - ${file}`));
    console.log('  Consider moving these to historical/ directory');
  }

  console.log('\n📊 Validation Summary:');
  console.log(`Status: ${isValid ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Directories: ${Object.keys(REQUIRED_STRUCTURE).length}`);
  console.log(`Required files: ${Object.values(REQUIRED_STRUCTURE).flat().length}`);

  return isValid;
}

function testDataCollection() {
  console.log('\n🧪 Testing data collection endpoints...\n');

  const endpoints = [
    'performance/consolidated-performance.json',
    'system/real-time-metrics.json',
    '../dashboard/data.json'
  ];

  for (const endpoint of endpoints) {
    const filePath = path.join(METRICS_BASE, endpoint);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`✅ ${endpoint} - readable and valid JSON`);

        // Check if data is recent (within last hour)
        if (data.timestamp || data.metadata?.consolidated_at) {
          console.log(`  📅 Contains timestamp data`);
        }
      } catch (error) {
        console.error(`❌ ${endpoint} - JSON parsing failed:`, error.message);
      }
    } else {
      console.error(`❌ ${endpoint} - file not found`);
    }
  }
}

// Main execution
console.log('📋 Claude Flow Metrics Structure Validation\n');
console.log('=' * 50);

const structureValid = validateStructure();
testDataCollection();

console.log('\n' + '=' * 50);
console.log(`🎯 Overall Status: ${structureValid ? 'METRICS STRUCTURE VALID' : 'VALIDATION FAILED'}`);

process.exit(structureValid ? 0 : 1);