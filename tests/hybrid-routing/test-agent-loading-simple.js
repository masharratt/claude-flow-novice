#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

async function testAgentLoading() {
  const agentsPath = path.join(rootDir, '.claude', 'agents');

  const coreAgents = [
    { type: 'coder', path: path.join(agentsPath, 'core-agents', 'coder.md') },
    { type: 'architect', path: path.join(agentsPath, 'core-agents', 'architect.md') },
    { type: 'tester', path: path.join(agentsPath, 'core-agents', 'tester.md') },
    { type: 'reviewer', path: path.join(agentsPath, 'core-agents', 'reviewer.md') },
    { type: 'security-specialist', path: path.join(agentsPath, 'security', 'security-specialist.md') }
  ];

  console.log('\n🧪 Testing Agent File Loading\n');

  const loadedAgents = {};

  for (const agent of coreAgents) {
    try {
      console.log(`📄 Loading ${agent.type}...`);
      const content = await fs.readFile(agent.path, 'utf-8');

      // Handle both Unix \n and Windows \r\n line endings
      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!frontmatterMatch) {
        console.log(`   ❌ No frontmatter found\n`);
        continue;
      }

      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/description:\s*([^\n]+(?:\n(?!\w+:).+)*)/);
      const description = descMatch ? descMatch[1].trim() : '';

      if (!description) {
        console.log(`   ❌ No description found\n`);
        continue;
      }

      const keywordsMatch = description.match(/Keywords\s*[-:]\s*(.+?)(?:\n|$)/i);
      const keywords = keywordsMatch
        ? keywordsMatch[1].split(/[,;]/).map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
        : [];

      console.log(`   ✅ Loaded: ${keywords.length} keywords`);
      console.log(`   First 5 keywords: ${keywords.slice(0, 5).join(', ')}\n`);

      loadedAgents[agent.type] = {
        type: agent.type,
        description,
        keywords,
        systemPrompt: content.replace(/^---[\s\S]*?---\n/, '')
      };

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  }

  console.log(`\n📊 Summary: Loaded ${Object.keys(loadedAgents).length}/${coreAgents.length} agents`);
  console.log(`✅ Loaded: ${Object.keys(loadedAgents).join(', ')}`);

  const missing = coreAgents.filter(a => !loadedAgents[a.type]).map(a => a.type);
  if (missing.length > 0) {
    console.log(`❌ Missing: ${missing.join(', ')}`);
  }
}

testAgentLoading();
