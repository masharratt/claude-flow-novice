/**
 * Debug agent profile loading
 */

console.log('\n=== Profile Loader Debug ===\n');

import { join } from 'path';
import { existsSync } from 'fs';

const agentsDir = join(process.cwd(), '.claude', 'agents');
console.log(`Current working directory: ${process.cwd()}`);
console.log(`Agents directory: ${agentsDir}`);
console.log(`Agents dir exists: ${existsSync(agentsDir)}`);

const coderPath = join(agentsDir, 'coder.md');
console.log(`\nCoder path: ${coderPath}`);
console.log(`Coder file exists: ${existsSync(coderPath)}`);

if (existsSync(coderPath)) {
  const { readFileSync } = await import('fs');
  const content = readFileSync(coderPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  console.log(`\nFrontmatter match: ${frontmatterMatch ? 'Found' : 'Not found'}`);

  if (frontmatterMatch) {
    console.log('\nFrontmatter content:');
    console.log(frontmatterMatch[1]);
  }
}

// Now test the loader
const { AgentProfileLoader } = await import('./dist/src/providers/index.js');
const loader = new AgentProfileLoader();
const profile = loader.loadProfile('coder');

console.log('\n=== Loaded Profile ===');
console.log(JSON.stringify(profile, null, 2));
