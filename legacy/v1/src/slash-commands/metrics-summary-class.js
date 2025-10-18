#!/usr/bin/env node

/**
 * Metrics Summary Slash Command Class
 *
 * Slash command wrapper for metrics-summary.js script.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class MetricsSummaryCommand {
  constructor() {
    this.name = 'metrics-summary';
    this.description = 'Display aggregated metrics statistics with configurable time frame';
    this.usage = '/metrics-summary [--minutes=60] [--provider=all] [--model=all]';
  }

  /**
   * Get command help
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: this.usage,
      examples: [
        '/metrics-summary',
        '/metrics-summary --minutes=1440',
        '/metrics-summary --minutes=60 --provider=z.ai',
        '/metrics-summary --minutes=10080 --model=glm-4.6',
      ],
      options: [
        '--minutes=<N>    Time frame in minutes (default: 60 = last hour)',
        '--provider=<P>   Filter by provider: all, anthropic, z.ai (default: all)',
        '--model=<M>      Filter by model name (default: all)',
      ],
    };
  }

  /**
   * Execute command
   */
  async execute(args, context = {}) {
    try {
      const scriptPath = join(__dirname, 'metrics-summary.js');
      const nodeArgs = args.join(' ');

      // Execute metrics-summary.js script
      const output = execSync(`node "${scriptPath}" ${nodeArgs}`, {
        encoding: 'utf8',
        cwd: join(__dirname, '../..'),
        stdio: 'pipe',
      });

      return {
        success: true,
        output: output,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString() || '',
      };
    }
  }
}

export default MetricsSummaryCommand;
