#!/usr/bin/env node
/**
 * MDAP Agent Profile Standardization Processor v2
 * - Standardizes all frontmatter to single-line format
 * - Converts multi-line arrays to comma-separated inline arrays
 * - Adds missing fields (skills, tags, version, priority, color)
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, 'cfn-dev-team');
const BATCH_SIZE = 10;

// Available colors for agents
const COLORS = [
  'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo',
  'purple', 'pink', 'rose', 'amber', 'lime', 'emerald', 'sky', 'violet',
  'fuchsia', 'slate', 'zinc', 'stone', 'coral', 'crimson', 'gold', 'mint'
];

// Skills mapping by category
const CATEGORY_SKILLS = {
  'analysts': ['cfn-project-analysis', 'cfn-ruvector-codebase-index'],
  'architecture': ['cfn-planning', 'cfn-task-planning'],
  'coordinators': ['cfn-loop-orchestration', 'cfn-redis-coordination'],
  'dev-ops': ['cfn-docker-runtime', 'cfn-github-workflow'],
  'developers': ['cfn-agent-spawning', 'cfn-test-framework'],
  'documentation': ['cfn-session-handoff', 'cfn-knowledge-base'],
  'product-owners': ['cfn-sprint-execution', 'cfn-validation-framework'],
  'reviewers': ['cfn-validation-framework', 'cfn-test-framework'],
  'testers': ['cfn-test-framework', 'cfn-validation-framework'],
  'utility': ['cfn-agent-tooling', 'cfn-skill-management'],
  'testing': ['cfn-test-framework', 'cfn-validation-framework'],
  'quality': ['cfn-validation-framework', 'cfn-project-analysis'],
  'personas': ['cfn-session-handoff', 'cfn-knowledge-base'],
  'frontend': ['cfn-agent-spawning', 'cfn-test-framework'],
  'database': ['cfn-memory-persistence', 'cfn-parameterized-queries'],
  'data': ['cfn-memory-persistence', 'cfn-ruvector-codebase-index']
};

// Priority mapping
const CATEGORY_PRIORITY = {
  'coordinators': 'P1',
  'quality': 'P1',
  'analysts': 'P2',
  'architecture': 'P2',
  'dev-ops': 'P2',
  'developers': 'P2',
  'documentation': 'P3',
  'product-owners': 'P2',
  'reviewers': 'P2',
  'testers': 'P2',
  'utility': 'P3',
  'testing': 'P2',
  'personas': 'P2',
  'frontend': 'P2',
  'database': 'P2',
  'data': 'P2'
};

// Find all agent files recursively
function findAgentFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findAgentFiles(fullPath, files);
    } else if (entry.name.endsWith('.md') &&
               !entry.name.startsWith('README') &&
               !entry.name.startsWith('CLAUDE')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Get category from file path
function getCategory(filePath) {
  const parts = filePath.split(path.sep);
  const agentsIndex = parts.indexOf('cfn-dev-team');
  if (agentsIndex >= 0 && parts.length > agentsIndex + 1) {
    return parts[agentsIndex + 1];
  }
  return 'utility';
}

// Get random color (seeded by filename for consistency)
function getColorForAgent(filename) {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = ((hash << 5) - hash) + filename.charCodeAt(i);
    hash = hash & hash;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Parse YAML frontmatter into structured object
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const fields = {};
  const fieldOrder = [];

  const lines = yaml.split('\n');
  let currentKey = null;
  let currentArray = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a key: value line
    const keyMatch = line.match(/^([a-z_]+):\s*(.*)/);
    if (keyMatch) {
      const key = keyMatch[1];
      const value = keyMatch[2].trim();

      fieldOrder.push(key);
      currentKey = key;

      if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array: [val1, val2]
        fields[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        currentArray = null;
      } else if (value === '' || value === '[]') {
        // Start of multi-line array or empty array
        fields[key] = [];
        currentArray = key;
      } else {
        // Simple value
        fields[key] = value.replace(/^["']|["']$/g, '');
        currentArray = null;
      }
    } else if (currentArray && line.match(/^\s+-\s+/)) {
      // Array item
      const value = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '');
      fields[currentArray].push(value);
    }
  }

  return { fields, fieldOrder };
}

// Generate tags from agent name and capabilities
function generateTags(name, capabilities = [], category) {
  const tags = new Set();

  // Split name into tags
  name.split('-').forEach(part => {
    if (part.length > 2) tags.add(part);
  });

  // Add capabilities
  if (Array.isArray(capabilities)) {
    capabilities.forEach(cap => tags.add(cap));
  }

  // Add category
  tags.add(category);

  return Array.from(tags).slice(0, 8);
}

// Format array as inline comma-separated
function formatArray(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return '[]';
  return `[${arr.join(', ')}]`;
}

// Build standardized frontmatter (all single-line)
function buildStandardizedFrontmatter(fields, category, filename) {
  const lines = ['---'];

  // Required field order
  const standardOrder = [
    'name', 'description', 'model', 'type', 'color',
    'skills', 'capabilities', 'tags',
    'validation_hooks', 'acl_level', 'version', 'priority'
  ];

  // Get default values
  const defaultSkills = CATEGORY_SKILLS[category] || ['cfn-agent-tooling'];
  const defaultPriority = CATEGORY_PRIORITY[category] || 'P2';
  const color = fields.color || getColorForAgent(filename);
  const tags = fields.tags || generateTags(fields.name || filename.replace('.md', ''), fields.capabilities, category);

  // Build field map with defaults
  const finalFields = {
    name: fields.name,
    description: fields.description,
    model: fields.model,
    type: fields.type || 'specialist',
    color: color,
    skills: fields.skills || defaultSkills,
    capabilities: fields.capabilities,
    tags: tags,
    validation_hooks: fields.validation_hooks,
    acl_level: fields.acl_level || '1',
    version: fields.version || '1.0.0',
    priority: fields.priority || defaultPriority
  };

  // Output in standard order
  for (const key of standardOrder) {
    const value = finalFields[key];

    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}: ${formatArray(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  // Add any extra fields not in standard order
  for (const key of Object.keys(fields)) {
    if (!standardOrder.includes(key) && fields[key] !== undefined) {
      const value = fields[key];
      if (Array.isArray(value)) {
        lines.push(`${key}: ${formatArray(value)}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
  }

  lines.push('---');
  return lines.join('\n');
}

// Process single agent file (atomic micro-task)
async function processAgent(filePath) {
  const startTime = Date.now();
  const filename = path.basename(filePath);
  const category = getCategory(filePath);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseFrontmatter(content);

    if (!parsed) {
      return { file: filename, status: 'skipped', reason: 'no frontmatter', duration: Date.now() - startTime };
    }

    const { fields } = parsed;

    // Check if this is a valid agent file (has name, description, model)
    if (!fields.name || !fields.description || !fields.model) {
      return { file: filename, status: 'skipped', reason: 'not an agent file', duration: Date.now() - startTime };
    }

    // Build new standardized frontmatter
    const newFrontmatter = buildStandardizedFrontmatter(fields, category, filename);

    // Get content after frontmatter
    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : '';

    // Write new content
    const newContent = newFrontmatter + '\n' + body;
    fs.writeFileSync(filePath, newContent);

    // Track what changed
    const changes = [];
    if (!fields.skills) changes.push('skills');
    if (!fields.tags) changes.push('tags');
    if (!fields.version) changes.push('version');
    if (!fields.priority) changes.push('priority');
    if (!fields.color) changes.push('color');
    if (Array.isArray(fields.capabilities) || Array.isArray(fields.validation_hooks)) {
      changes.push('format');
    }

    return {
      file: filename,
      status: 'updated',
      changes,
      category,
      duration: Date.now() - startTime
    };

  } catch (error) {
    return { file: filename, status: 'error', reason: error.message, duration: Date.now() - startTime };
  }
}

// Process batch in parallel
async function processBatch(files, batchNum) {
  console.log(`\n=== Batch ${batchNum} (${files.length} files) ===`);
  const results = await Promise.all(files.map(processAgent));

  for (const result of results) {
    if (result.status === 'updated') {
      console.log(`  ✓ ${result.file} (${result.changes.join(', ')}) [${result.duration}ms]`);
    } else if (result.status === 'skipped') {
      console.log(`  - ${result.file} (${result.reason})`);
    } else {
      console.log(`  ✗ ${result.file} (${result.reason})`);
    }
  }

  return results;
}

// Validation
function validateAgent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseFrontmatter(content);

  if (!parsed) return { valid: false, missing: ['frontmatter'] };

  const { fields } = parsed;

  // Skip non-agent files
  if (!fields.name || !fields.description || !fields.model) {
    return { valid: true, skipped: true };
  }

  const required = ['name', 'description', 'model', 'skills', 'tags', 'version', 'priority', 'color'];
  const missing = required.filter(field => !fields[field]);

  // Check format (should be single-line arrays)
  const content_check = fs.readFileSync(filePath, 'utf-8');
  const hasMultiLineArray = /^\s+-\s+/m.test(content_check.split('---')[1] || '');

  return {
    valid: missing.length === 0 && !hasMultiLineArray,
    missing,
    hasMultiLineArray
  };
}

// Main execution
async function main() {
  console.log('=== MDAP Agent Profile Standardization v2 ===');
  console.log(`Target: ${AGENTS_DIR}`);
  console.log('Features: single-line format, inline arrays, random colors\n');

  const startTime = Date.now();

  // Find all agent files
  const files = findAgentFiles(AGENTS_DIR);
  console.log(`Found ${files.length} files to process`);

  // Process in batches (parallel MDAP-style)
  const allResults = [];
  let batchNum = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batchNum++;
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await processBatch(batch, batchNum);
    allResults.push(...results);
  }

  // Summary
  const updated = allResults.filter(r => r.status === 'updated').length;
  const skipped = allResults.filter(r => r.status === 'skipped').length;
  const errors = allResults.filter(r => r.status === 'error').length;

  console.log('\n=== Processing Complete ===');
  console.log(`Total: ${files.length} | Updated: ${updated} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log(`Duration: ${Date.now() - startTime}ms`);
  console.log(`Batches: ${batchNum}`);

  // Validation
  console.log('\n=== Validation ===');
  let valid = 0;
  let invalid = 0;
  const invalidFiles = [];

  for (const file of files) {
    const result = validateAgent(file);
    if (result.skipped || result.valid) {
      valid++;
    } else {
      invalid++;
      const issues = [];
      if (result.missing?.length) issues.push(`missing: ${result.missing.join(', ')}`);
      if (result.hasMultiLineArray) issues.push('has multi-line arrays');
      invalidFiles.push({ file: path.basename(file), issues });
    }
  }

  if (invalidFiles.length > 0) {
    console.log('Invalid files:');
    invalidFiles.slice(0, 10).forEach(f => console.log(`  ✗ ${f.file}: ${f.issues.join('; ')}`));
    if (invalidFiles.length > 10) console.log(`  ... and ${invalidFiles.length - 10} more`);
  }

  const passRate = (valid / files.length * 100).toFixed(1);
  console.log(`\nValid: ${valid}/${files.length} (${passRate}% pass rate)`);

  // Write results
  const resultsFile = path.join(__dirname, 'mdap-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({
    task: 'agent-profile-standardization-v2',
    timestamp: new Date().toISOString(),
    total_files: files.length,
    updated,
    skipped,
    errors,
    valid,
    invalid,
    pass_rate: valid / files.length,
    duration_ms: Date.now() - startTime,
    batches: batchNum
  }, null, 2));

  console.log(`\nResults written to: ${resultsFile}`);

  return { valid, invalid, passRate };
}

main().catch(console.error);
