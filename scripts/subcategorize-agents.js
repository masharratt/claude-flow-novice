#!/usr/bin/env node

/**
 * Create subcategories within each main agent category
 * Provides finer-grained organization for easier browsing
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '../agents');

// Subcategory definitions for each main category
const SUBCATEGORIES = {
  'development-engineering': {
    'backend': {
      keywords: ['backend', 'api', 'rest', 'graphql', 'server', 'node', 'django', 'flask', 'express', 'fastapi'],
      description: 'Backend development, APIs, server-side programming'
    },
    'frontend': {
      keywords: ['frontend', 'react', 'angular', 'vue', 'ui', 'javascript', 'typescript', 'css', 'html', 'web-ui'],
      description: 'Frontend frameworks, UI development, client-side'
    },
    'mobile': {
      keywords: ['mobile', 'ios', 'android', 'react-native', 'flutter', 'swift', 'kotlin'],
      description: 'Mobile app development (iOS, Android)'
    },
    'devops': {
      keywords: ['devops', 'docker', 'kubernetes', 'ci-cd', 'cicd', 'deployment', 'container', 'gitops', 'argocd', 'flux', 'jenkins'],
      description: 'DevOps, CI/CD, containerization, orchestration'
    },
    'testing': {
      keywords: ['test', 'qa', 'quality', 'acceptance', 'cypress', 'jest', 'playwright', 'e2e', 'integration-test', 'unit-test', 'fuzz'],
      description: 'Testing, QA, quality assurance, test automation'
    },
    'database': {
      keywords: ['database', 'sql', 'nosql', 'postgres', 'mysql', 'mongodb', 'redis', 'data-model'],
      description: 'Database design, SQL, NoSQL, data modeling'
    },
    'architecture': {
      keywords: ['architect', 'architecture', 'design-pattern', 'microservices', 'system-design', 'scalability'],
      description: 'Software architecture, system design, patterns'
    },
    'integration': {
      keywords: ['integration', 'api-integration', 'third-party', 'webhook', 'payment-integration', 'oauth'],
      description: 'API integration, third-party services, webhooks'
    }
  },

  'industry-specific': {
    'healthcare': {
      keywords: ['health', 'medical', 'clinical', 'patient', 'doctor', 'hospital', 'telemedicine', 'pharmaceutical'],
      description: 'Healthcare, medical, clinical systems'
    },
    'finance': {
      keywords: ['finance', 'banking', 'fintech', 'trading', 'investment', 'accounting', 'ledger', 'financial'],
      description: 'Finance, banking, fintech, trading'
    },
    'legal': {
      keywords: ['legal', 'law', 'attorney', 'court', 'litigation', 'contract', 'compliance-legal'],
      description: 'Legal services, law firms, compliance'
    },
    'education': {
      keywords: ['education', 'learning', 'student', 'teacher', 'academic', 'e-learning', 'training', 'course'],
      description: 'Education, e-learning, academic systems'
    },
    'retail': {
      keywords: ['retail', 'e-commerce', 'shop', 'store', 'pos', 'inventory', 'product', 'catalog'],
      description: 'Retail, e-commerce, point-of-sale'
    },
    'manufacturing': {
      keywords: ['manufactur', 'production', 'factory', 'supply-chain', 'logistics', 'warehouse', 'industrial'],
      description: 'Manufacturing, production, supply chain'
    },
    'entertainment': {
      keywords: ['entertainment', 'media', 'gaming', 'sports', 'music', 'video', 'streaming', 'content'],
      description: 'Entertainment, media, gaming, sports'
    },
    'other': {
      keywords: ['real-estate', 'hospitality', 'tourism', 'energy', 'utilities', 'telecom', 'insurance', 'nonprofit'],
      description: 'Other industries (real estate, hospitality, etc.)'
    }
  },

  'ai-ml-automation': {
    'machine-learning': {
      keywords: ['machine-learning', 'ml', 'supervised', 'unsupervised', 'classification', 'regression', 'scikit'],
      description: 'Traditional machine learning, classification, regression'
    },
    'deep-learning': {
      keywords: ['deep-learning', 'neural', 'tensorflow', 'pytorch', 'keras', 'cnn', 'rnn', 'transformer'],
      description: 'Deep learning, neural networks, frameworks'
    },
    'nlp': {
      keywords: ['nlp', 'natural-language', 'text', 'sentiment', 'chatbot', 'language-model', 'tokeniz'],
      description: 'Natural language processing, text analysis'
    },
    'computer-vision': {
      keywords: ['vision', 'image', 'video', 'object-detection', 'facial', 'ocr', 'recognition'],
      description: 'Computer vision, image processing, object detection'
    },
    'mlops': {
      keywords: ['mlops', 'model-deployment', 'training-pipeline', 'experiment-tracking', 'model-serving'],
      description: 'MLOps, model deployment, training pipelines'
    },
    'automation': {
      keywords: ['automation', 'intelligent-automation', 'workflow', 'orchestration', 'agent-based'],
      description: 'Intelligent automation, workflow automation'
    }
  },

  'business-operations': {
    'strategy': {
      keywords: ['strategy', 'strategic', 'planning', 'competitive', 'positioning', 'vision'],
      description: 'Business strategy, strategic planning'
    },
    'growth': {
      keywords: ['growth', 'scaling', 'expansion', 'market-expansion', 'growth-hacking'],
      description: 'Business growth, scaling, expansion'
    },
    'revenue': {
      keywords: ['revenue', 'sales', 'monetization', 'pricing', 'billing', 'subscription'],
      description: 'Revenue optimization, sales, monetization'
    },
    'customer': {
      keywords: ['customer', 'client', 'user-experience', 'crm', 'support', 'journey', 'satisfaction'],
      description: 'Customer experience, CRM, support'
    },
    'operations': {
      keywords: ['operations', 'operational', 'process', 'workflow', 'efficiency', 'optimization'],
      description: 'Operations management, process optimization'
    },
    'leadership': {
      keywords: ['leadership', 'management', 'executive', 'team-building', 'organizational'],
      description: 'Leadership, management, organizational development'
    }
  },

  'data-analytics': {
    'business-intelligence': {
      keywords: ['business-intelligence', 'bi', 'dashboard', 'reporting', 'kpi', 'metrics'],
      description: 'Business intelligence, dashboards, reporting'
    },
    'data-engineering': {
      keywords: ['etl', 'elt', 'pipeline', 'data-pipeline', 'warehouse', 'lake', 'ingestion'],
      description: 'Data engineering, ETL/ELT, data pipelines'
    },
    'analytics': {
      keywords: ['analytics', 'analysis', 'insights', 'statistical', 'predictive', 'prescriptive'],
      description: 'Data analytics, statistical analysis, insights'
    },
    'forecasting': {
      keywords: ['forecast', 'prediction', 'time-series', 'trend', 'anomaly-detection'],
      description: 'Forecasting, time-series analysis, predictions'
    },
    'visualization': {
      keywords: ['visualization', 'chart', 'graph', 'tableau', 'power-bi', 'data-viz'],
      description: 'Data visualization, charts, dashboards'
    }
  },

  'personal-professional': {
    'career': {
      keywords: ['career', 'job', 'interview', 'resume', 'job-search', 'promotion', 'transition'],
      description: 'Career development, job search, interviews'
    },
    'leadership': {
      keywords: ['leadership', 'leader', 'management', 'executive', 'mentoring', 'coaching'],
      description: 'Leadership development, coaching, mentoring'
    },
    'productivity': {
      keywords: ['productivity', 'time-management', 'efficiency', 'goal', 'planning', 'organization'],
      description: 'Productivity, time management, goal setting'
    },
    'communication': {
      keywords: ['communication', 'presentation', 'public-speaking', 'writing', 'listening', 'feedback'],
      description: 'Communication skills, presentations, feedback'
    },
    'wellness': {
      keywords: ['wellness', 'stress', 'work-life', 'balance', 'mindfulness', 'mental-health', 'emotional'],
      description: 'Wellness, work-life balance, mental health'
    }
  },

  'security-compliance': {
    'cybersecurity': {
      keywords: ['cybersecurity', 'security', 'threat', 'vulnerability', 'penetration', 'firewall', 'encryption'],
      description: 'Cybersecurity, threat analysis, penetration testing'
    },
    'compliance': {
      keywords: ['compliance', 'regulatory', 'audit', 'gdpr', 'hipaa', 'sox', 'pci', 'iso'],
      description: 'Compliance, regulatory requirements, auditing'
    },
    'privacy': {
      keywords: ['privacy', 'data-privacy', 'gdpr', 'personal-data', 'consent', 'anonymization'],
      description: 'Data privacy, GDPR, personal data protection'
    },
    'access-control': {
      keywords: ['access-control', 'authentication', 'authorization', 'identity', 'zero-trust', 'iam'],
      description: 'Access control, authentication, identity management'
    }
  },

  'payment-financial': {
    'payment-gateways': {
      keywords: ['stripe', 'paypal', 'square', 'braintree', 'checkout', 'payment-gateway', 'merchant'],
      description: 'Payment gateways (Stripe, PayPal, Square, etc.)'
    },
    'bnpl': {
      keywords: ['bnpl', 'afterpay', 'klarna', 'affirm', 'installment', 'buy-now-pay-later'],
      description: 'Buy-now-pay-later, installment payments'
    },
    'cryptocurrency': {
      keywords: ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'wallet', 'web3'],
      description: 'Cryptocurrency, blockchain, Web3 payments'
    },
    'billing': {
      keywords: ['billing', 'invoice', 'subscription', 'recurring', 'pricing'],
      description: 'Billing systems, invoicing, subscriptions'
    }
  }
};

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
 * Categorize agent into subcategory
 */
function subcategorizeAgent(filename, content, mainCategory) {
  const subcategories = SUBCATEGORIES[mainCategory];
  if (!subcategories) return null;

  const frontmatter = extractFrontmatter(content);
  const searchText = (filename + ' ' + (frontmatter?.name || '') + ' ' + (frontmatter?.description || '')).toLowerCase();

  let bestSubcategory = null;
  let bestScore = 0;

  for (const [subcategory, config] of Object.entries(subcategories)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSubcategory = subcategory;
    }
  }

  // Default to first subcategory or 'other' if no match
  if (!bestSubcategory) {
    bestSubcategory = subcategories.other ? 'other' : Object.keys(subcategories)[0];
  }

  return bestSubcategory;
}

/**
 * Process a single main category
 */
function processCategory(mainCategory) {
  const categoryDir = path.join(AGENTS_DIR, mainCategory);
  if (!fs.existsSync(categoryDir)) {
    console.log(`⏭️  Skipping ${mainCategory} (not found)`);
    return null;
  }

  console.log(`\n📂 Processing ${mainCategory}...`);

  // Read agent files
  const files = fs.readdirSync(categoryDir)
    .filter(f => f.endsWith('.md') && f !== 'INDEX.md');

  if (files.length === 0) {
    console.log(`  No agents found in ${mainCategory}`);
    return null;
  }

  console.log(`  Found ${files.length} agents`);

  // Categorize into subcategories
  const subcategorization = {};
  const subcategoryConfigs = SUBCATEGORIES[mainCategory];

  for (const subcategory of Object.keys(subcategoryConfigs)) {
    subcategorization[subcategory] = [];
  }

  for (const file of files) {
    const filePath = path.join(categoryDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const subcategory = subcategorizeAgent(file, content, mainCategory);

    if (subcategory && subcategorization[subcategory]) {
      subcategorization[subcategory].push(file);
    }
  }

  // Display subcategorization
  console.log(`\n  Subcategories:`);
  for (const [subcategory, files] of Object.entries(subcategorization)) {
    if (files.length > 0) {
      console.log(`    ${subcategory}: ${files.length} agents`);
    }
  }

  // Create subdirectories and move files
  for (const [subcategory, config] of Object.entries(subcategoryConfigs)) {
    const subcategoryDir = path.join(categoryDir, subcategory);
    const filesToMove = subcategorization[subcategory];

    if (filesToMove.length === 0) continue;

    // Create directory
    if (!fs.existsSync(subcategoryDir)) {
      fs.mkdirSync(subcategoryDir, { recursive: true });
    }

    // Move files
    for (const file of filesToMove) {
      const src = path.join(categoryDir, file);
      const dest = path.join(subcategoryDir, file);
      fs.renameSync(src, dest);
    }

    // Create subcategory index
    const indexContent = `# ${subcategory.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

**Description:** ${config.description}
**Agent Count:** ${filesToMove.length}

## Available Agents

${filesToMove.sort().map(f => `- [${f.replace('.md', '')}](./${f})`).join('\n')}
`;

    fs.writeFileSync(path.join(subcategoryDir, 'INDEX.md'), indexContent);
  }

  // Update main category index
  const mainIndexContent = `# ${mainCategory.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

**Total Agents:** ${files.length}

## Subcategories

${Object.entries(subcategorization)
  .filter(([_, files]) => files.length > 0)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([subcat, files]) => {
    const config = subcategoryConfigs[subcat];
    return `### [${subcat}](${subcat}/INDEX.md) (${files.length} agents)

${config.description}
`;
  }).join('\n')}

## Quick Navigation

${Object.entries(subcategorization)
  .filter(([_, files]) => files.length > 0)
  .map(([subcat, files]) => `- [${subcat}](${subcat}/INDEX.md) - ${files.length} agents`)
  .join('\n')}
`;

  fs.writeFileSync(path.join(categoryDir, 'INDEX.md'), mainIndexContent);

  return {
    category: mainCategory,
    totalAgents: files.length,
    subcategories: Object.fromEntries(
      Object.entries(subcategorization).filter(([_, files]) => files.length > 0)
    )
  };
}

/**
 * Main subcategorization process
 */
async function subcategorizeAgents() {
  console.log('🔍 Subcategorizing agents within each main category...\n');

  const results = {};

  for (const mainCategory of Object.keys(SUBCATEGORIES)) {
    const result = processCategory(mainCategory);
    if (result) {
      results[mainCategory] = result;
    }
  }

  console.log('\n\n✅ Subcategorization complete!\n');

  // Generate summary
  console.log('📊 Summary by Main Category:\n');
  for (const [category, data] of Object.entries(results)) {
    console.log(`${category}: ${data.totalAgents} agents in ${Object.keys(data.subcategories).length} subcategories`);
  }

  console.log('\n✨ Done!\n');
}

// Run
subcategorizeAgents().catch(console.error);
