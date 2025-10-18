#!/usr/bin/env node

/**
 * Categorize imported agents into subdirectories
 * Analyzes YAML frontmatter and filenames to determine appropriate category
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '../agents');

// Category definitions with keyword patterns
const CATEGORIES = {
  'development-engineering': {
    keywords: ['backend', 'frontend', 'api', 'rest', 'graphql', 'react', 'angular', 'vue', 'typescript',
               'javascript', 'python', 'java', 'rust', 'go', 'node', 'developer', 'engineer', 'code',
               'programming', 'devops', 'kubernetes', 'docker', 'ci/cd', 'mobile', 'ios', 'android',
               'web', 'fullstack', 'microservices', 'architecture-analyst', 'database', 'sql', 'nosql',
               'git', 'version-control', 'deployment', 'container', 'orchestration', 'testing-specialist',
               'acceptance-test', 'integration', 'unit-test', 'qa', 'quality-assurance', 'debugging'],
    description: 'Backend, frontend, mobile, DevOps, API development, testing'
  },
  'ai-ml-automation': {
    keywords: ['machine-learning', 'deep-learning', 'neural', 'tensorflow', 'pytorch', 'ai', 'ml',
               'model', 'training', 'inference', 'nlp', 'computer-vision', 'data-science', 'mlops',
               'automation', 'intelligent', 'prediction-engine', 'anomaly-detection', 'algorithm',
               'optimization', 'reinforcement-learning', 'supervised', 'unsupervised'],
    description: 'Machine learning, deep learning, neural networks, MLOps, automation'
  },
  'business-operations': {
    keywords: ['business', 'strategy', 'growth', 'revenue', 'sales', 'marketing', 'customer',
               'operations', 'management', 'planning', 'leadership', 'executive', 'roi', 'kpi',
               'metrics', 'analytics-insights', 'competitive', 'market', 'venture', 'startup',
               'scaling', 'transformation', 'change-management', 'stakeholder', 'organizational'],
    description: 'Business strategy, growth, revenue, customer experience, operations'
  },
  'security-compliance': {
    keywords: ['security', 'cybersecurity', 'compliance', 'audit', 'gdpr', 'privacy', 'threat',
               'vulnerability', 'penetration', 'encryption', 'authentication', 'authorization',
               'zero-trust', 'firewall', 'monitoring', 'incident', 'forensic', 'risk', 'pci',
               'hipaa', 'sox', 'iso', 'regulatory', 'data-privacy', 'infosec'],
    description: 'Cybersecurity, compliance, privacy, threat analysis, auditing'
  },
  'data-analytics': {
    keywords: ['data', 'analytics', 'bi', 'business-intelligence', 'etl', 'elt', 'pipeline',
               'warehouse', 'lake', 'visualization', 'dashboard', 'reporting', 'insights',
               'forecasting', 'time-series', 'statistical', 'metrics', 'kpi-dashboard',
               'real-time-analytics', 'stream-processing', 'batch-processing'],
    description: 'Business intelligence, analytics, ETL, forecasting, data engineering'
  },
  'personal-professional': {
    keywords: ['career', 'personal', 'professional', 'development', 'coaching', 'mentoring',
               'leadership-development', 'emotional-intelligence', 'productivity', 'wellness',
               'work-life', 'communication', 'networking', 'resume', 'interview', 'skill',
               'learning', 'education', 'training', 'mindfulness', 'motivation', 'goal-setting',
               'time-management', 'stress', 'wellness', 'active-listening'],
    description: 'Career, leadership, emotional intelligence, productivity, personal growth'
  },
  'payment-financial': {
    keywords: ['payment', 'stripe', 'paypal', 'square', 'braintree', 'checkout', 'transaction',
               'financial', 'billing', 'invoice', 'subscription', 'bnpl', 'afterpay', 'klarna',
               'affirm', 'gateway', 'merchant', 'pos', 'e-commerce-payment', 'apple-pay', 'google-pay',
               'alipay', 'wechat-pay', 'cryptocurrency', 'blockchain-payment'],
    description: 'Payment gateways, BNPL, financial transactions, billing systems'
  },
  'industry-specific': {
    keywords: ['healthcare', 'medical', 'clinical', 'patient', 'diagnosis', 'telemedicine',
               'finance-sector', 'banking', 'insurance', 'legal', 'law', 'compliance-legal',
               'education', 'e-learning', 'academic', 'retail', 'manufacturing', 'logistics',
               'supply-chain', 'real-estate', 'hospitality', 'tourism', 'energy', 'utilities',
               'telecommunications', 'media', 'entertainment', 'sports', 'gaming'],
    description: 'Healthcare, finance, legal, education, retail, manufacturing, etc.'
  }
};

// Files to keep in root
const META_FILES = ['CLAUDE.md', 'README.md', 'IMPORTED_AGENTS_README.md', 'MIGRATION_SUMMARY.md', '.gitkeep'];

/**
 * Extract YAML frontmatter from markdown file
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();
    frontmatter[key] = value;
  }

  return frontmatter;
}

/**
 * Categorize agent based on name and description
 */
function categorizeAgent(filename, content) {
  const frontmatter = extractFrontmatter(content);
  const searchText = (filename + ' ' + (frontmatter?.name || '') + ' ' + (frontmatter?.description || '')).toLowerCase();

  let bestCategory = null;
  let bestScore = 0;

  for (const [category, config] of Object.entries(CATEGORIES)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Default to industry-specific if no clear match
  return bestCategory || 'industry-specific';
}

/**
 * Main categorization process
 */
async function categorizeAgents() {
  console.log('🔍 Analyzing agent files...\n');

  // Read all markdown files
  const files = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md') && !META_FILES.includes(f));

  console.log(`Found ${files.length} agent files to categorize\n`);

  // Categorize each file
  const categorization = {};
  for (const category of Object.keys(CATEGORIES)) {
    categorization[category] = [];
  }

  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const category = categorizeAgent(file, content);
    categorization[category].push(file);
  }

  // Display categorization summary
  console.log('📊 Categorization Summary:\n');
  for (const [category, files] of Object.entries(categorization)) {
    console.log(`${category}: ${files.length} agents`);
  }
  console.log('');

  // Create directories and move files
  console.log('📁 Creating category directories...\n');

  for (const [category, config] of Object.entries(CATEGORIES)) {
    const categoryDir = path.join(AGENTS_DIR, category);

    // Create directory
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
      console.log(`✓ Created ${category}/`);
    }

    // Move files
    const filesToMove = categorization[category];
    for (const file of filesToMove) {
      const src = path.join(AGENTS_DIR, file);
      const dest = path.join(categoryDir, file);
      fs.renameSync(src, dest);
    }

    // Create index file
    const indexContent = `# ${category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

**Description:** ${config.description}
**Agent Count:** ${filesToMove.length}

## Available Agents

${filesToMove.sort().map(f => `- [${f.replace('.md', '')}](./${f})`).join('\n')}
`;

    fs.writeFileSync(path.join(categoryDir, 'INDEX.md'), indexContent);
  }

  console.log('\n✅ Categorization complete!\n');

  // Generate summary report
  const summaryContent = `# Agent Categorization Summary

**Total Agents:** ${files.length}
**Categories:** ${Object.keys(CATEGORIES).length}
**Generated:** ${new Date().toISOString()}

## Category Breakdown

${Object.entries(categorization).map(([cat, files]) => {
  const config = CATEGORIES[cat];
  return `### ${cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} (${files.length} agents)

**Description:** ${config.description}
**Location:** \`agents/${cat}/\`

<details>
<summary>View agents in this category</summary>

${files.sort().map(f => `- ${f.replace('.md', '')}`).join('\n')}

</details>
`;
}).join('\n')}

## Quick Navigation

${Object.entries(categorization).map(([cat, files]) =>
  `- [${cat}](${cat}/INDEX.md) - ${files.length} agents`
).join('\n')}

## Usage

\`\`\`bash
# List agents in a category
ls agents/development-engineering/

# Find specific agent
find agents -name "*react*"

# Search across all agents
grep -r "keyword" agents/
\`\`\`
`;

  fs.writeFileSync(path.join(AGENTS_DIR, 'CATEGORIZATION_SUMMARY.md'), summaryContent);
  console.log('📄 Generated CATEGORIZATION_SUMMARY.md\n');

  // Final statistics
  console.log('📈 Final Statistics:\n');
  console.log(`Total agents categorized: ${files.length}`);
  console.log(`Categories created: ${Object.keys(CATEGORIES).length}`);
  console.log(`Meta files preserved: ${META_FILES.filter(f => fs.existsSync(path.join(AGENTS_DIR, f))).length}`);
  console.log('\n✨ Done!\n');
}

// Run
categorizeAgents().catch(console.error);
