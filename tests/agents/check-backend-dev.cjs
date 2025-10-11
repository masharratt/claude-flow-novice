const fs = require('fs');
const yaml = require('js-yaml');

const filePath = '.claude/agents/development/backend/dev-backend-api.md';
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/\r\n/g, '\n');

const match = content.match(/^---\n([\s\S]*?)\n---/);
if (!match) {
  console.log('ERROR: No frontmatter found');
  process.exit(1);
}

const frontmatter = yaml.load(match[1]);
const body = content.substring(match[0].length);

console.log('=== BACKEND-DEV COMPLIANCE CHECK ===\n');

const checks = {
  'name': !!frontmatter.name,
  'description': !!frontmatter.description,
  'tools': !!frontmatter.tools,
  'model': !!frontmatter.model,
  'color': !!frontmatter.color,
  'type': frontmatter.type === 'specialist',
  'capabilities': Array.isArray(frontmatter.capabilities),
  'validation_hooks': Array.isArray(frontmatter.validation_hooks) && frontmatter.validation_hooks.length >= 3,
  'acl_level': frontmatter.acl_level === 1,
  'lifecycle.pre_task': !!frontmatter.lifecycle?.pre_task,
  'lifecycle.post_task': !!frontmatter.lifecycle?.post_task,
  'SQLite Integration section': body.includes('SQLite Integration'),
  'CFN Loop 3 section': body.includes('CFN Loop 3'),
  'Error Handling section': body.includes('Error Handling'),
};

let passed = 0;
let total = 0;

for (const [check, result] of Object.entries(checks)) {
  total++;
  if (result) {
    passed++;
    console.log(`✅ ${check}`);
  } else {
    console.log(`❌ ${check}`);
  }
}

console.log(`\nScore: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);
console.log(`Compliant: ${passed === total ? 'YES ✅' : 'NO ❌'}`);
