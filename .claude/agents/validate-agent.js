#!/usr/bin/env node

/**
 * Agent Profile Validator
 *
 * Validates agent profiles against CLAUDE.md standards and design principles.
 * Checks frontmatter, prompt format, quality, and provides actionable recommendations.
 *
 * Usage:
 *   node validate-agent.js <path-to-agent.md>
 *   node validate-agent.js --all
 *
 * @module validate-agent
 */

import { readFile, readdir } from 'fs/promises';
import { resolve, dirname, basename, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const APPROVED_TOOLS = [
  'Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep', 'TodoWrite'
];

const APPROVED_MODELS = [
  'sonnet', 'haiku', 'opus', 'sonnet-3-5', 'sonnet-4-5', 'claude-3-5-sonnet-20241022'
];

const VALID_COLOR_FORMATS = [
  /^[a-z]+$/i,                    // Named colors: "orange", "green"
  /^#[0-9A-F]{6}$/i,              // Hex colors: "#FF9800"
  /^rgb\(\d+,\s*\d+,\s*\d+\)$/i  // RGB colors: "rgb(255, 152, 0)"
];

const AGENT_TYPES = [
  'coder', 'reviewer', 'tester', 'planner', 'researcher', 'coordinator',
  'backend-dev', 'api-docs', 'system-architect', 'code-analyzer',
  'mobile-dev', 'tdd-london-swarm', 'production-validator',
  'perf-analyzer', 'performance-benchmarker', 'task-orchestrator'
];

// ============================================================================
// YAML Parser (Simplified - handles basic YAML)
// ============================================================================

function parseYAML(yamlString) {
  const lines = yamlString.split('\n');
  const result = {};
  let currentKey = null;
  let currentArray = null;
  let inMultiline = false;
  let multilineKey = null;
  let multilineContent = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Handle multiline blocks
    if (trimmed.endsWith('|') || trimmed.endsWith('>')) {
      multilineKey = trimmed.slice(0, -1).replace(':', '').trim();
      inMultiline = true;
      multilineContent = [];
      continue;
    }

    if (inMultiline) {
      if (line.startsWith('  ')) {
        multilineContent.push(line.slice(2));
      } else {
        result[multilineKey] = multilineContent.join('\n');
        inMultiline = false;
        multilineKey = null;
      }
    }

    // Handle array items
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      if (currentArray) {
        currentArray.push(value);
      }
      continue;
    }

    // Handle key-value pairs
    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      currentKey = key.trim();

      if (value === '') {
        // Start of array or object
        currentArray = [];
        result[currentKey] = currentArray;
      } else {
        // Simple value
        currentArray = null;
        // Try to parse as number or boolean
        if (value === 'true') result[currentKey] = true;
        else if (value === 'false') result[currentKey] = false;
        else if (!isNaN(value) && value !== '') result[currentKey] = Number(value);
        else result[currentKey] = value.replace(/^['"]|['"]$/g, ''); // Remove quotes
      }
    }
  }

  // Close any remaining multiline
  if (inMultiline && multilineKey) {
    result[multilineKey] = multilineContent.join('\n');
  }

  return result;
}

// ============================================================================
// Format Detection & Classification
// ============================================================================

/**
 * Classifies agent prompt format based on content analysis
 */
function classifyFormat(content, frontmatter) {
  const promptContent = content.split('---').slice(2).join('---');
  const lines = promptContent.split('\n').filter(line => line.trim());
  const wordCount = promptContent.split(/\s+/).length;

  // Count code blocks
  const codeBlockCount = (promptContent.match(/```/g) || []).length / 2;

  // Count structured sections
  const hasCapabilities = frontmatter.capabilities !== undefined;
  const hasHooks = frontmatter.hooks !== undefined;
  const hasLifecycle = frontmatter.lifecycle !== undefined;

  // Classification logic based on empirical findings
  const classification = {
    format: 'unknown',
    confidence: 0,
    characteristics: {},
    tokens: 0,
    words: wordCount
  };

  // CODE-HEAVY: 2000+ tokens, multiple code examples, implementation patterns
  if (codeBlockCount >= 3 && wordCount > 1500) {
    classification.format = 'code-heavy';
    classification.confidence = 0.9;
    classification.tokens = 2000 + Math.floor(wordCount * 0.75);
    classification.characteristics = {
      codeBlocks: codeBlockCount,
      hasExamples: true,
      hasImplementationPatterns: true,
      verbosity: 'high'
    };
  }
  // METADATA: 1000-1500 tokens, structured frontmatter, YAML/TS blocks
  else if ((hasCapabilities || hasHooks || hasLifecycle) && codeBlockCount >= 1) {
    classification.format = 'metadata';
    classification.confidence = 0.85;
    classification.tokens = 1000 + Math.floor(wordCount * 0.5);
    classification.characteristics = {
      codeBlocks: codeBlockCount,
      hasStructuredMetadata: true,
      hasCapabilities,
      hasHooks,
      hasLifecycle,
      verbosity: 'medium'
    };
  }
  // MINIMAL: 500-800 tokens, lean prompts, reasoning-focused
  else if (wordCount < 1000 && codeBlockCount <= 1) {
    classification.format = 'minimal';
    classification.confidence = 0.8;
    classification.tokens = 500 + Math.floor(wordCount * 0.33);
    classification.characteristics = {
      codeBlocks: codeBlockCount,
      reasoningFocused: true,
      verbosity: 'low'
    };
  }
  // METADATA as default middle ground
  else {
    classification.format = 'metadata';
    classification.confidence = 0.6;
    classification.tokens = 1000;
    classification.characteristics = {
      codeBlocks: codeBlockCount,
      verbosity: 'medium'
    };
  }

  return classification;
}

/**
 * Estimates task complexity based on agent type and description
 */
function estimateComplexity(frontmatter, content) {
  const description = (frontmatter.description || '').toLowerCase();
  const promptContent = content.toLowerCase();

  const indicators = {
    basic: ['simple', 'basic', 'string', 'array', 'validation', 'parse', 'format', 'convert'],
    medium: ['multiple', 'integrate', 'refactor', 'concurrent', 'cache', 'queue', 'worker', 'pipeline'],
    complex: ['architecture', 'system', 'distributed', 'scalable', 'design', 'trade-off', 'performance-critical', 'zero-copy']
  };

  const scores = {
    basic: 0,
    medium: 0,
    complex: 0
  };

  // Score based on keywords
  for (const [level, keywords] of Object.entries(indicators)) {
    for (const keyword of keywords) {
      if (description.includes(keyword)) scores[level]++;
      if (promptContent.includes(keyword)) scores[level] += 0.5;
    }
  }

  // Determine complexity
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return { complexity: 'medium', confidence: 'low', scores };

  const complexity = Object.keys(scores).find(key => scores[key] === maxScore);
  const confidence = maxScore >= 2 ? 'high' : maxScore >= 1 ? 'medium' : 'low';

  return { complexity, confidence, scores };
}

/**
 * Recommends optimal format based on agent type and complexity
 */
function recommendFormat(agentType, complexity) {
  // Always minimal for architectural reasoning
  if (agentType === 'architect' || agentType === 'system-architect') {
    return {
      recommended: 'minimal',
      reason: 'Architectural agents need reasoning freedom, not examples',
      confidence: 'high'
    };
  }

  // Always minimal for reviewers
  if (agentType === 'reviewer' || agentType === 'code-analyzer') {
    return {
      recommended: 'minimal',
      reason: 'Review agents need to reason about code, not follow patterns',
      confidence: 'high'
    };
  }

  // Always metadata for researchers
  if (agentType === 'researcher') {
    return {
      recommended: 'metadata',
      reason: 'Research needs structured output format',
      confidence: 'high'
    };
  }

  // Coder agents: complexity-based selection (validated)
  if (agentType === 'coder' || agentType === 'backend-dev' || agentType === 'mobile-dev') {
    if (complexity === 'basic') {
      return {
        recommended: 'code-heavy',
        reason: 'Basic tasks benefit from examples (+43% quality boost validated)',
        confidence: 'high',
        evidence: 'Empirically validated on Rust benchmarks'
      };
    }
    if (complexity === 'complex') {
      return {
        recommended: 'minimal',
        reason: 'Complex tasks need reasoning, examples constrain solution space',
        confidence: 'high',
        evidence: 'Validated: 0% quality gap between formats on complex tasks'
      };
    }
    return {
      recommended: 'metadata',
      reason: 'Medium complexity benefits from structure without over-constraining',
      confidence: 'medium'
    };
  }

  // Tester agents: similar to coders
  if (agentType === 'tester' || agentType === 'tdd-london-swarm') {
    if (complexity === 'basic') {
      return {
        recommended: 'code-heavy',
        reason: 'Test structure and patterns benefit from examples',
        confidence: 'medium'
      };
    }
    return {
      recommended: 'metadata',
      reason: 'Test organization needs structure',
      confidence: 'medium'
    };
  }

  // Default: metadata as safe middle ground
  return {
    recommended: 'metadata',
    reason: 'Balanced approach for general tasks',
    confidence: 'medium'
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates frontmatter structure and required fields
 */
function validateFrontmatter(frontmatter) {
  const issues = [];
  const warnings = [];

  // Required fields
  if (!frontmatter.name) {
    issues.push({
      severity: 'error',
      field: 'name',
      message: 'Missing required field: name',
      fix: 'Add "name: agent-name" to frontmatter'
    });
  }

  if (!frontmatter.description) {
    issues.push({
      severity: 'error',
      field: 'description',
      message: 'Missing required field: description',
      fix: 'Add "description: ..." to frontmatter'
    });
  } else if (frontmatter.description.length < 50) {
    warnings.push({
      severity: 'warning',
      field: 'description',
      message: 'Description is too short (< 50 chars)',
      fix: 'Expand description to include key capabilities and use cases'
    });
  }

  // Tools validation
  if (!frontmatter.tools) {
    warnings.push({
      severity: 'warning',
      field: 'tools',
      message: 'Missing tools specification',
      fix: 'Add "tools: Read, Write, Edit, ..." to frontmatter'
    });
  } else {
    const tools = typeof frontmatter.tools === 'string'
      ? frontmatter.tools.split(',').map(t => t.trim())
      : frontmatter.tools;

    const invalidTools = tools.filter(tool => !APPROVED_TOOLS.includes(tool));
    if (invalidTools.length > 0) {
      issues.push({
        severity: 'error',
        field: 'tools',
        message: `Invalid tools: ${invalidTools.join(', ')}`,
        fix: `Use only approved tools: ${APPROVED_TOOLS.join(', ')}`
      });
    }
  }

  // Model validation
  if (!frontmatter.model) {
    warnings.push({
      severity: 'warning',
      field: 'model',
      message: 'Missing model specification',
      fix: 'Add "model: sonnet" (or haiku, opus) to frontmatter'
    });
  } else if (!APPROVED_MODELS.includes(frontmatter.model)) {
    warnings.push({
      severity: 'warning',
      field: 'model',
      message: `Uncommon model: ${frontmatter.model}`,
      fix: `Consider using: ${APPROVED_MODELS.slice(0, 3).join(', ')}`
    });
  }

  // Color validation
  if (!frontmatter.color) {
    warnings.push({
      severity: 'warning',
      field: 'color',
      message: 'Missing color specification',
      fix: 'Add "color: blue" (or hex "#0000FF") to frontmatter'
    });
  } else {
    const colorValid = VALID_COLOR_FORMATS.some(regex => regex.test(frontmatter.color));
    if (!colorValid) {
      issues.push({
        severity: 'error',
        field: 'color',
        message: `Invalid color format: ${frontmatter.color}`,
        fix: 'Use named color (e.g., "orange"), hex (e.g., "#FF9800"), or RGB (e.g., "rgb(255, 152, 0)")'
      });
    }
  }

  return { issues, warnings };
}

/**
 * Analyzes prompt quality and structure
 */
function analyzePromptQuality(content) {
  const promptContent = content.split('---').slice(2).join('---');
  const recommendations = [];

  // Check for clear role definition
  const hasRoleDefinition = /you are|your role|you specialize in/i.test(promptContent.slice(0, 500));
  if (!hasRoleDefinition) {
    recommendations.push({
      category: 'role-clarity',
      message: 'Add clear role definition in first paragraph',
      example: 'Start with "You are a [Role] specialized in..."'
    });
  }

  // Check for specific responsibilities
  const hasResponsibilities = /responsibilities|duties|tasks|core functions/i.test(promptContent);
  if (!hasResponsibilities) {
    recommendations.push({
      category: 'structure',
      message: 'Add clear responsibilities section',
      example: '## Core Responsibilities\n1. [Responsibility 1]\n2. [Responsibility 2]'
    });
  }

  // Check for anti-patterns
  const negativeCount = (promptContent.match(/don't|never|avoid(?!\s+memory leaks)/gi) || []).length;
  if (negativeCount > 5) {
    recommendations.push({
      category: 'anti-pattern',
      message: `Excessive negative instructions (${negativeCount} found)`,
      fix: 'Rephrase as positive guidance: "Use X instead of Y"'
    });
  }

  return { recommendations };
}

/**
 * Checks format alignment with task complexity
 */
function checkFormatAlignment(agentType, format, complexity) {
  const recommendation = recommendFormat(agentType, complexity.complexity);
  const alignment = {
    aligned: format.format === recommendation.recommended,
    currentFormat: format.format,
    recommendedFormat: recommendation.recommended,
    reason: recommendation.reason,
    confidence: recommendation.confidence,
    evidence: recommendation.evidence || 'Hypothesized from validated coder agent patterns'
  };

  if (!alignment.aligned) {
    alignment.impact = estimateImpact(format.format, recommendation.recommended, complexity.complexity);
  }

  return alignment;
}

/**
 * Estimates impact of format mismatch
 */
function estimateImpact(currentFormat, recommendedFormat, complexity) {
  const impacts = {
    'basic-minimal-to-code-heavy': '+43% quality boost (validated)',
    'basic-metadata-to-code-heavy': '+10-15% quality improvement',
    'complex-code-heavy-to-minimal': '0% quality gap, 10% faster response',
    'complex-metadata-to-minimal': '0-3% quality gap, 5% faster response'
  };

  const key = `${complexity}-${currentFormat}-to-${recommendedFormat}`;
  return impacts[key] || 'Marginal impact expected';
}

// ============================================================================
// Validation Orchestration
// ============================================================================

/**
 * Performs complete validation of an agent profile
 */
async function validateAgent(filePath) {
  const content = await readFile(filePath, 'utf-8');

  // Parse frontmatter (handle both \n--- and ---\n endings)
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return {
      valid: false,
      file: filePath,
      agentType: 'unknown',
      complianceScore: 0,
      frontmatter: {
        valid: false,
        issues: [{
          severity: 'error',
          field: 'frontmatter',
          message: 'No frontmatter found',
          fix: 'Add YAML frontmatter at the beginning of the file'
        }],
        warnings: []
      },
      format: {
        classification: { format: 'unknown', confidence: 0, characteristics: {}, tokens: 0, words: 0 },
        complexity: { complexity: 'unknown', confidence: 'low', scores: { basic: 0, medium: 0, complex: 0 } },
        alignment: { aligned: false, currentFormat: 'unknown', recommendedFormat: 'minimal', reason: 'No frontmatter', confidence: 'low', evidence: 'N/A' }
      },
      quality: { recommendations: [] },
      summary: 'CRITICAL ERROR: No frontmatter found'
    };
  }

  let frontmatter;
  try {
    frontmatter = parseYAML(frontmatterMatch[1]);
  } catch (err) {
    return {
      valid: false,
      file: filePath,
      agentType: 'unknown',
      complianceScore: 0,
      frontmatter: {
        valid: false,
        issues: [{
          severity: 'error',
          field: 'frontmatter',
          message: `Invalid YAML syntax: ${err.message}`,
          fix: 'Fix YAML syntax errors in frontmatter'
        }],
        warnings: []
      },
      format: {
        classification: { format: 'unknown', confidence: 0, characteristics: {}, tokens: 0, words: 0 },
        complexity: { complexity: 'unknown', confidence: 'low', scores: { basic: 0, medium: 0, complex: 0 } },
        alignment: { aligned: false, currentFormat: 'unknown', recommendedFormat: 'minimal', reason: 'Invalid YAML', confidence: 'low', evidence: 'N/A' }
      },
      quality: { recommendations: [] },
      summary: `CRITICAL ERROR: Invalid YAML syntax`
    };
  }

  // Run validations
  const frontmatterValidation = validateFrontmatter(frontmatter);
  const formatClassification = classifyFormat(content, frontmatter);
  const complexityEstimate = estimateComplexity(frontmatter, content);
  const qualityAnalysis = analyzePromptQuality(content);

  // Determine agent type
  const agentType = frontmatter.name || 'unknown';
  const detectedType = AGENT_TYPES.find(type => agentType.toLowerCase().includes(type)) || 'unknown';

  const formatAlignment = checkFormatAlignment(detectedType, formatClassification, complexityEstimate);

  // Calculate compliance score
  const totalIssues = frontmatterValidation.issues.length;
  const totalWarnings = frontmatterValidation.warnings.length;
  const totalRecommendations = qualityAnalysis.recommendations.length;

  const complianceScore = Math.max(0, 100 - (totalIssues * 20) - (totalWarnings * 5) - (totalRecommendations * 2));

  return {
    valid: totalIssues === 0,
    file: filePath,
    agentType: detectedType || 'unknown',
    complianceScore,
    frontmatter: {
      valid: frontmatterValidation.issues.length === 0,
      issues: frontmatterValidation.issues,
      warnings: frontmatterValidation.warnings
    },
    format: {
      classification: formatClassification,
      complexity: complexityEstimate,
      alignment: formatAlignment
    },
    quality: qualityAnalysis,
    summary: generateSummary(complianceScore, formatAlignment, frontmatterValidation, qualityAnalysis)
  };
}

/**
 * Generates human-readable summary
 */
function generateSummary(score, alignment, frontmatter, quality) {
  const status = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Needs Improvement';

  const summary = [`Agent Profile Status: ${status} (${score}/100)`];

  if (frontmatter.issues.length > 0) {
    summary.push(`⚠️  ${frontmatter.issues.length} critical issue(s) found`);
  }

  if (!alignment.aligned) {
    summary.push(`📊 Format mismatch: Using ${alignment.currentFormat}, recommend ${alignment.recommendedFormat}`);
    summary.push(`   Reason: ${alignment.reason}`);
    summary.push(`   Impact: ${alignment.impact || 'See recommendations'}`);
  } else {
    summary.push(`✅ Format aligned with best practices (${alignment.currentFormat})`);
  }

  if (quality.recommendations.length > 0) {
    summary.push(`💡 ${quality.recommendations.length} improvement recommendation(s)`);
  }

  return summary.join('\n');
}

// ============================================================================
// CLI Interface
// ============================================================================

/**
 * Formats validation results for console output
 */
function formatOutput(result) {
  const sections = [];

  // Header
  sections.push('═'.repeat(80));
  sections.push(`AGENT VALIDATION REPORT: ${basename(result.file)}`);
  sections.push('═'.repeat(80));
  sections.push('');

  // Summary
  sections.push('SUMMARY');
  sections.push('─'.repeat(80));
  sections.push(result.summary);
  sections.push('');

  // Format Analysis
  sections.push('FORMAT ANALYSIS');
  sections.push('─'.repeat(80));
  sections.push(`Detected Format: ${result.format.classification.format.toUpperCase()}`);
  sections.push(`Confidence: ${(result.format.classification.confidence * 100).toFixed(0)}%`);
  sections.push(`Estimated Tokens: ~${result.format.classification.tokens}`);
  sections.push(`Word Count: ${result.format.classification.words}`);
  sections.push('');
  sections.push('Characteristics:');
  for (const [key, value] of Object.entries(result.format.classification.characteristics)) {
    sections.push(`  • ${key}: ${value}`);
  }
  sections.push('');

  // Complexity Estimate
  sections.push('COMPLEXITY ANALYSIS');
  sections.push('─'.repeat(80));
  sections.push(`Estimated Complexity: ${result.format.complexity.complexity.toUpperCase()}`);
  sections.push(`Confidence: ${result.format.complexity.confidence.toUpperCase()}`);
  sections.push('Indicator Scores:');
  for (const [level, score] of Object.entries(result.format.complexity.scores)) {
    sections.push(`  • ${level}: ${score.toFixed(1)}`);
  }
  sections.push('');

  // Format Alignment
  sections.push('FORMAT RECOMMENDATION');
  sections.push('─'.repeat(80));
  sections.push(`Current Format: ${result.format.alignment.currentFormat.toUpperCase()}`);
  sections.push(`Recommended Format: ${result.format.alignment.recommendedFormat.toUpperCase()}`);
  sections.push(`Alignment: ${result.format.alignment.aligned ? '✅ ALIGNED' : '⚠️  MISALIGNED'}`);
  sections.push(`Confidence: ${result.format.alignment.confidence.toUpperCase()}`);
  sections.push(`Reason: ${result.format.alignment.reason}`);
  if (result.format.alignment.evidence) {
    sections.push(`Evidence: ${result.format.alignment.evidence}`);
  }
  if (result.format.alignment.impact) {
    sections.push(`Expected Impact: ${result.format.alignment.impact}`);
  }
  sections.push('');

  // Issues
  if (result.frontmatter.issues.length > 0) {
    sections.push('CRITICAL ISSUES');
    sections.push('─'.repeat(80));
    result.frontmatter.issues.forEach((issue, i) => {
      sections.push(`${i + 1}. [${issue.field}] ${issue.message}`);
      sections.push(`   Fix: ${issue.fix}`);
      sections.push('');
    });
  }

  // Warnings
  if (result.frontmatter.warnings.length > 0) {
    sections.push('WARNINGS');
    sections.push('─'.repeat(80));
    result.frontmatter.warnings.forEach((warning, i) => {
      sections.push(`${i + 1}. [${warning.field}] ${warning.message}`);
      sections.push(`   Fix: ${warning.fix}`);
      sections.push('');
    });
  }

  // Recommendations
  if (result.quality.recommendations.length > 0) {
    sections.push('IMPROVEMENT RECOMMENDATIONS');
    sections.push('─'.repeat(80));
    result.quality.recommendations.forEach((rec, i) => {
      sections.push(`${i + 1}. [${rec.category}] ${rec.message}`);
      if (rec.impact) sections.push(`   Impact: ${rec.impact}`);
      if (rec.example) sections.push(`   Example: ${rec.example}`);
      if (rec.fix) sections.push(`   Fix: ${rec.fix}`);
      sections.push('');
    });
  }

  // Footer
  sections.push('═'.repeat(80));
  sections.push(`Compliance Score: ${result.complianceScore}/100`);
  sections.push('═'.repeat(80));

  return sections.join('\n');
}

/**
 * Find all agent markdown files recursively
 */
async function findAgentFiles(dir, results = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory() && entry.name !== 'node_modules') {
      await findAgentFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Skip certain files
      if (!entry.name.includes('README') && !entry.name.includes('CLAUDE_AGENT_DESIGN_PRINCIPLES')) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node validate-agent.js <path-to-agent.md>');
    console.error('       node validate-agent.js --all');
    process.exit(1);
  }

  if (args[0] === '--all') {
    // Validate all agents
    const agentsDir = resolve(__dirname);
    const agentFiles = await findAgentFiles(agentsDir);

    console.log(`Found ${agentFiles.length} agent files to validate\n`);

    const results = [];
    for (const file of agentFiles) {
      try {
        const result = await validateAgent(file);
        results.push(result);

        // Print summary for each
        const relPath = file.replace(agentsDir + '/', '');
        console.log(`${relPath}: ${result.valid ? '✅' : '❌'} Score: ${result.complianceScore}/100`);
      } catch (err) {
        console.error(`Error validating ${file}: ${err.message}`);
      }
    }

    // Summary statistics
    console.log('\n' + '═'.repeat(80));
    console.log('VALIDATION SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total Agents: ${results.length}`);
    console.log(`Passed: ${results.filter(r => r.valid).length}`);
    console.log(`Failed: ${results.filter(r => !r.valid).length}`);
    console.log(`Average Score: ${(results.reduce((sum, r) => sum + r.complianceScore, 0) / results.length).toFixed(1)}/100`);
    console.log('');

    // Top performers
    const topPerformers = results.sort((a, b) => b.complianceScore - a.complianceScore).slice(0, 5);
    console.log('Top 5 Performers:');
    topPerformers.forEach((r, i) => {
      console.log(`  ${i + 1}. ${basename(r.file)}: ${r.complianceScore}/100`);
    });
    console.log('');

    // Needs improvement
    const needsImprovement = results.filter(r => r.complianceScore < 75).length;
    if (needsImprovement > 0) {
      console.log(`⚠️  ${needsImprovement} agent(s) need improvement (score < 75)`);
    }

  } else {
    // Validate single agent
    const filePath = resolve(process.cwd(), args[0]);

    try {
      const result = await validateAgent(filePath);
      console.log(formatOutput(result));

      // Exit code based on validation result
      process.exit(result.valid ? 0 : 1);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      console.error('Stack:', err.stack);
      process.exit(1);
    }
  }
}

// Run if called directly
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export { validateAgent, classifyFormat, estimateComplexity, recommendFormat };