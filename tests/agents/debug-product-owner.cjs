const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Parse an agent file
function parseAgentFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Normalize line endings (Windows CRLF → Unix LF)
  content = content.replace(/\r\n/g, '\n');

  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return { error: 'No frontmatter found' };
  }

  let frontmatter;
  try {
    frontmatter = yaml.parse(match[1]);
  } catch (e) {
    return { error: 'YAML parse error: ' + e.message };
  }

  const body = content.substring(match[0].length);

  return { frontmatter, body };
}

// Categorize agent
function categorizeAgent(frontmatter) {
  const type = frontmatter.type?.toLowerCase() || '';
  const desc = (frontmatter.description || '').toLowerCase();

  if (type === 'strategic') return 'strategic';
  if (desc.includes('product owner') || desc.includes('goap')) return 'strategic';

  return 'unknown';
}

// Validate strategic agent
function validateStrategic(agent) {
  const violations = [];
  const { frontmatter, body } = agent;

  console.log('\n=== FRONTMATTER CHECKS ===');

  // Universal checks
  if (!frontmatter.name) {
    violations.push('Missing: name');
    console.log('❌ name: MISSING');
  } else {
    console.log('✅ name:', frontmatter.name);
  }

  if (!frontmatter.description) {
    violations.push('Missing: description');
    console.log('❌ description: MISSING');
  } else {
    console.log('✅ description: present (' + frontmatter.description.length + ' chars)');
  }

  if (!frontmatter.tools) {
    violations.push('Missing: tools');
    console.log('❌ tools: MISSING');
  } else {
    console.log('✅ tools:', frontmatter.tools);
  }

  if (!frontmatter.model) {
    violations.push('Missing: model');
    console.log('❌ model: MISSING');
  } else {
    console.log('✅ model:', frontmatter.model);
  }

  if (!frontmatter.color) {
    violations.push('Missing: color');
    console.log('❌ color: MISSING');
  } else {
    console.log('✅ color:', frontmatter.color);
  }

  if (!frontmatter.validation_hooks) {
    violations.push('Missing: validation_hooks');
    console.log('❌ validation_hooks: MISSING');
  } else {
    console.log('✅ validation_hooks:', frontmatter.validation_hooks);
  }

  if (frontmatter.acl_level === undefined) {
    violations.push('Missing: acl_level');
    console.log('❌ acl_level: MISSING');
  } else {
    console.log('✅ acl_level:', frontmatter.acl_level);
  }

  if (!frontmatter.lifecycle) {
    violations.push('Missing: lifecycle');
    console.log('❌ lifecycle: MISSING');
  } else {
    console.log('✅ lifecycle: present');
  }

  // Strategic-specific checks
  console.log('\n=== STRATEGIC-SPECIFIC CHECKS ===');

  if (frontmatter.acl_level !== 4) {
    violations.push('Strategic: ACL level must be 4');
    console.log('❌ ACL Level 4: current is', frontmatter.acl_level);
  } else {
    console.log('✅ ACL Level 4');
  }

  if (frontmatter.type !== 'strategic') {
    violations.push('Strategic: type must be "strategic"');
    console.log('❌ type="strategic": current is', frontmatter.type);
  } else {
    console.log('✅ type="strategic"');
  }

  console.log('\n=== BODY PATTERN CHECKS ===');

  const hasLoop4 = body.includes('Loop 4') || body.includes('loop 4') || body.includes('GOAP');
  if (!hasLoop4) {
    violations.push('Strategic: Missing Loop 4 GOAP patterns');
    console.log('❌ Loop 4 GOAP patterns: MISSING');
  } else {
    console.log('✅ Loop 4 GOAP patterns');
  }

  const has365day = body.includes('365') || body.includes('31536000');
  if (!has365day) {
    violations.push('Strategic: Missing 365-day retention');
    console.log('❌ 365-day retention: MISSING');
  } else {
    console.log('✅ 365-day retention');
  }

  const hasLoop32Reading = body.includes('Loop 3') && body.includes('Loop 2');
  if (!hasLoop32Reading) {
    violations.push('Strategic: Missing Loop 3+2 reading patterns');
    console.log('❌ Loop 3+2 reading: MISSING');
  } else {
    console.log('✅ Loop 3+2 reading');
  }

  return violations;
}

// Main
const filePath = '.claude/agents/cfn-loop/product-owner.md';
console.log('Checking:', filePath);

const agent = parseAgentFile(filePath);

if (agent.error) {
  console.error('ERROR:', agent.error);
  process.exit(1);
}

const category = categorizeAgent(agent.frontmatter);
console.log('\nCategory:', category);

if (category !== 'strategic') {
  console.error('ERROR: Not categorized as strategic!');
  process.exit(1);
}

const violations = validateStrategic(agent);

console.log('\n=== SUMMARY ===');
console.log('Total Violations:', violations.length);
console.log('Compliant:', violations.length === 0 ? 'YES ✅' : 'NO ❌');

if (violations.length > 0) {
  console.log('\nViolations:');
  violations.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
}
