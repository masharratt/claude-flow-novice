#!/usr/bin/env node

/**
 * Metrics Summary Slash Command
 *
 * Displays aggregated metrics statistics with configurable time frame.
 *
 * Usage:
 *   /metrics-summary [--minutes=60] [--provider=all] [--model=all]
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile, writeFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
function parseArgs(args) {
  const options = {
    minutes: 60, // Default: last hour
    provider: 'all',
    model: 'all',
    action: null, // enable, disable, status
  };

  for (const arg of args) {
    if (arg.startsWith('--minutes=')) {
      options.minutes = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--provider=')) {
      options.provider = arg.split('=')[1];
    } else if (arg.startsWith('--model=')) {
      options.model = arg.split('=')[1];
    } else if (arg === '--enable' || arg === 'enable') {
      options.action = 'enable';
    } else if (arg === '--disable' || arg === 'disable') {
      options.action = 'disable';
    } else if (arg === '--status' || arg === 'status') {
      options.action = 'status';
    }
  }

  return options;
}

// Format large numbers
function formatNumber(num) {
  return num.toLocaleString();
}

// Format duration
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Calculate cost estimate
function estimateCost(inputTokens, outputTokens, model, provider) {
  // Pricing per 1K tokens (USD)
  const pricing = {
    'anthropic': {
      'haiku': { input: 0.003, output: 0.015 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    },
    'z.ai': {
      'glm-4.5': { input: 0.003, output: 0.015 },
      'glm-4.6': { input: 0.003, output: 0.015 },
      'haiku': { input: 0.003, output: 0.015 },
    },
  };

  const providerPricing = pricing[provider];
  if (!providerPricing || !providerPricing[model]) {
    return null;
  }

  const modelPricing = providerPricing[model];
  const inputCost = (inputTokens / 1000) * modelPricing.input;
  const outputCost = (outputTokens / 1000) * modelPricing.output;

  return inputCost + outputCost;
}

// Generate metrics summary
function generateSummary(options) {
  const dbPath = join(__dirname, '../../.claude-flow-novice/metrics.db');
  const db = new Database(dbPath, { readonly: true });

  // Calculate time threshold
  const now = Date.now();
  const timeThreshold = now - (options.minutes * 60 * 1000);

  console.log(`\n📊 Metrics Summary (Last ${options.minutes} minutes)\n`);
  console.log(`Time Range: ${new Date(timeThreshold).toLocaleString()} → ${new Date(now).toLocaleString()}\n`);
  console.log('─'.repeat(80) + '\n');

  // Query: API Requests by Provider
  const requestQuery = `
    SELECT
      json_extract(tags, '$.provider') as provider,
      COUNT(*) as count
    FROM metrics
    WHERE name = 'claude.api.request'
      AND timestamp >= ?
      ${options.provider !== 'all' ? `AND json_extract(tags, '$.provider') = '${options.provider}'` : ''}
      ${options.model !== 'all' ? `AND json_extract(tags, '$.model') = '${options.model}'` : ''}
    GROUP BY provider
    ORDER BY count DESC
  `;

  const requests = db.prepare(requestQuery).all(timeThreshold);

  if (requests.length > 0) {
    console.log('🌐 API Requests by Provider:');
    let totalRequests = 0;
    requests.forEach(row => {
      console.log(`   ${row.provider || 'unknown'}: ${formatNumber(row.count)}`);
      totalRequests += row.count;
    });
    console.log(`   TOTAL: ${formatNumber(totalRequests)}\n`);
  } else {
    console.log('🌐 API Requests: No data in time range\n');
  }

  // Query: Token Usage by Provider and Model
  const tokenQuery = `
    SELECT
      json_extract(tags, '$.provider') as provider,
      json_extract(tags, '$.model') as model,
      SUM(CASE WHEN name = 'claude.tokens.input' THEN value ELSE 0 END) as input_tokens,
      SUM(CASE WHEN name = 'claude.tokens.output' THEN value ELSE 0 END) as output_tokens,
      SUM(CASE WHEN name = 'claude.tokens.total' THEN value ELSE 0 END) as total_tokens
    FROM metrics
    WHERE name IN ('claude.tokens.input', 'claude.tokens.output', 'claude.tokens.total')
      AND timestamp >= ?
      ${options.provider !== 'all' ? `AND json_extract(tags, '$.provider') = '${options.provider}'` : ''}
      ${options.model !== 'all' ? `AND json_extract(tags, '$.model') = '${options.model}'` : ''}
    GROUP BY provider, model
    ORDER BY total_tokens DESC
  `;

  const tokens = db.prepare(tokenQuery).all(timeThreshold);

  if (tokens.length > 0) {
    console.log('🎯 Token Usage by Provider & Model:');
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;

    tokens.forEach(row => {
      const inputTokens = row.input_tokens || 0;
      const outputTokens = row.output_tokens || 0;
      const totalTokens = row.total_tokens || 0;

      totalInput += inputTokens;
      totalOutput += outputTokens;

      const cost = estimateCost(inputTokens, outputTokens, row.model, row.provider);
      if (cost !== null) {
        totalCost += cost;
      }

      console.log(`   ${row.provider || 'unknown'} / ${row.model || 'unknown'}:`);
      console.log(`      Input:  ${formatNumber(inputTokens)}`);
      console.log(`      Output: ${formatNumber(outputTokens)}`);
      console.log(`      Total:  ${formatNumber(totalTokens)}`);
      if (cost !== null) {
        console.log(`      Cost:   $${cost.toFixed(4)}`);
      }
    });

    console.log(`   TOTAL:`);
    console.log(`      Input:  ${formatNumber(totalInput)}`);
    console.log(`      Output: ${formatNumber(totalOutput)}`);
    console.log(`      Total:  ${formatNumber(totalInput + totalOutput)}`);
    if (totalCost > 0) {
      console.log(`      Cost:   $${totalCost.toFixed(4)}`);
    }
    console.log();
  } else {
    console.log('🎯 Token Usage: No data in time range\n');
  }

  // Query: Error Rate
  const errorQuery = `
    SELECT
      COUNT(*) as total_errors
    FROM metrics
    WHERE name = 'claude.api.error'
      AND timestamp >= ?
      ${options.provider !== 'all' ? `AND json_extract(tags, '$.provider') = '${options.provider}'` : ''}
      ${options.model !== 'all' ? `AND json_extract(tags, '$.model') = '${options.model}'` : ''}
  `;

  const errors = db.prepare(errorQuery).get(timeThreshold);
  const totalRequests = requests.reduce((sum, r) => sum + r.count, 0);

  if (totalRequests > 0) {
    const errorRate = ((errors.total_errors || 0) / totalRequests) * 100;
    console.log('⚠️  Error Rate:');
    console.log(`   Errors: ${formatNumber(errors.total_errors || 0)} / ${formatNumber(totalRequests)}`);
    console.log(`   Rate:   ${errorRate.toFixed(2)}%\n`);
  } else {
    console.log('⚠️  Error Rate: No requests in time range\n');
  }

  // Query: Average Duration by Provider
  const durationQuery = `
    SELECT
      json_extract(tags, '$.provider') as provider,
      json_extract(tags, '$.status') as status,
      AVG(value) as avg_duration,
      MIN(value) as min_duration,
      MAX(value) as max_duration,
      COUNT(*) as count
    FROM metrics
    WHERE name = 'claude.api.duration'
      AND timestamp >= ?
      ${options.provider !== 'all' ? `AND json_extract(tags, '$.provider') = '${options.provider}'` : ''}
      ${options.model !== 'all' ? `AND json_extract(tags, '$.model') = '${options.model}'` : ''}
    GROUP BY provider, status
    ORDER BY provider, status
  `;

  const durations = db.prepare(durationQuery).all(timeThreshold);

  if (durations.length > 0) {
    console.log('⏱️  API Duration by Provider:');
    durations.forEach(row => {
      console.log(`   ${row.provider || 'unknown'} (${row.status || 'unknown'}):`);
      console.log(`      Avg: ${formatDuration(row.avg_duration)}`);
      console.log(`      Min: ${formatDuration(row.min_duration)}`);
      console.log(`      Max: ${formatDuration(row.max_duration)}`);
      console.log(`      Count: ${formatNumber(row.count)}`);
    });
    console.log();
  } else {
    console.log('⏱️  API Duration: No data in time range\n');
  }

  // Query: Top Models
  const modelQuery = `
    SELECT
      json_extract(tags, '$.model') as model,
      COUNT(*) as count
    FROM metrics
    WHERE name = 'claude.api.request'
      AND timestamp >= ?
      ${options.provider !== 'all' ? `AND json_extract(tags, '$.provider') = '${options.provider}'` : ''}
      ${options.model !== 'all' ? `AND json_extract(tags, '$.model') = '${options.model}'` : ''}
    GROUP BY model
    ORDER BY count DESC
    LIMIT 5
  `;

  const topModels = db.prepare(modelQuery).all(timeThreshold);

  if (topModels.length > 0) {
    console.log('🏆 Top Models:');
    topModels.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.model || 'unknown'}: ${formatNumber(row.count)} requests`);
    });
    console.log();
  } else {
    console.log('🏆 Top Models: No data in time range\n');
  }

  console.log('─'.repeat(80) + '\n');

  db.close();
}

// Manage metrics tracking toggle
async function manageTracking(action) {
  const configPath = join(__dirname, '../../.claude/settings.json');

  try {
    // Read current settings
    const settingsContent = await readFile(configPath, 'utf8');
    const settings = JSON.parse(settingsContent);

    if (action === 'status') {
      const enabled = settings.env?.CLAUDE_FLOW_TELEMETRY_ENABLED !== 'false';
      console.log('\n📊 Metrics Tracking Status:\n');
      console.log(`Status: ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
      console.log(`Setting: CLAUDE_FLOW_TELEMETRY_ENABLED=${settings.env?.CLAUDE_FLOW_TELEMETRY_ENABLED || 'true'}`);
      console.log(`\nTo change: /metrics-summary --enable OR /metrics-summary --disable\n`);
      return;
    }

    if (action === 'enable') {
      settings.env = settings.env || {};
      settings.env.CLAUDE_FLOW_TELEMETRY_ENABLED = 'true';
      await writeFile(configPath, JSON.stringify(settings, null, 2));
      console.log('\n✅ Metrics tracking ENABLED');
      console.log('All API requests, tokens, and performance metrics will now be tracked.\n');
      return;
    }

    if (action === 'disable') {
      settings.env = settings.env || {};
      settings.env.CLAUDE_FLOW_TELEMETRY_ENABLED = 'false';
      await writeFile(configPath, JSON.stringify(settings, null, 2));
      console.log('\n❌ Metrics tracking DISABLED');
      console.log('No metrics will be collected until re-enabled.\n');
      return;
    }
  } catch (error) {
    console.error('❌ Error managing tracking settings:', error.message);
    process.exit(1);
  }
}

// Main execution
(async () => {
  try {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    // Handle tracking management actions
    if (options.action) {
      await manageTracking(options.action);
      process.exit(0);
    }

    // Generate summary
    generateSummary(options);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
