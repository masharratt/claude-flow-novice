const fs = require('fs');
const yaml = require('yaml');

const filePath = '.claude/agents/cfn-loop/product-owner.md';
const content = fs.readFileSync(filePath, 'utf8');

// Extract frontmatter
const match = content.match(/^---\n([\s\S]*?)\n---/);
if (!match) {
  console.log('ERROR: No frontmatter found');
  process.exit(1);
}

const frontmatter = yaml.parse(match[1]);

console.log('=== PRODUCT OWNER FRONTMATTER ===');
console.log('type:', frontmatter.type);
console.log('acl_level:', frontmatter.acl_level);
console.log('validation_hooks:', frontmatter.validation_hooks);
console.log('lifecycle:', frontmatter.lifecycle ? 'present' : 'MISSING');
console.log();

// Check body for strategic patterns
const body = content.substring(match[0].length);

console.log('=== BODY SECTION CHECKS ===');
console.log('Loop 4 GOAP Decision:', body.includes('Loop 4 GOAP') ? 'YES' : 'NO');
console.log('365-day retention:', body.includes('365') || body.includes('31536000') ? 'YES' : 'NO');
console.log('Reading Loop 3+2:', body.includes('Loop 3') && body.includes('Loop 2') ? 'YES' : 'NO');
console.log();

// Check for specific strategic requirements
console.log('=== STRATEGIC REQUIREMENTS ===');
console.log('Has GOAP patterns:', body.includes('GOAP') || body.includes('A* search') ? 'YES' : 'NO');
console.log('Has decision types:', body.includes('PROCEED') && body.includes('DEFER') && body.includes('ESCALATE') ? 'YES' : 'NO');
console.log('Has ACL 4 usage:', body.includes('aclLevel: 4') || body.includes('acl_level: 4') ? 'YES' : 'NO');
