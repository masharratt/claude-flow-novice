#!/usr/bin/env node

import { AgentSelector, AgentSelection } from './agent-selector';
import * as path from 'path';

/**
 * CLI entry point for agent selection
 * Usage: npx ts-node src/cli.ts "task description" [--min-validators N]
 */
async function main(): Promise<void> {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.length === 0) {
      // No task description provided, return default
      const defaultResult: AgentSelection = {
        loop3: ['backend-developer', 'devops-engineer'],
        loop2: ['code-reviewer', 'tester', 'code-quality-validator'],
        product_owner: 'product-owner',
        category: 'default',
        confidence: 0.70
      };
      console.log(JSON.stringify(defaultResult));
      return;
    }

    const taskDescription = args[0];
    let minValidators = 3;

    // Parse optional parameters
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--min-validators' && i + 1 < args.length) {
        const parsed = parseInt(args[i + 1], 10);
        if (!isNaN(parsed) && parsed > 0) {
          minValidators = parsed;
        }
        i++;
      }
    }

    // Create selector with proper paths
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    const mappingsPath = path.join(
      projectRoot,
      '.claude/skills/cfn-agent-selection-with-fallback/agent-mappings.json'
    );
    const agentsDir = path.join(projectRoot, '.claude/agents/cfn-dev-team');

    const selector = new AgentSelector(mappingsPath, agentsDir);

    // Select agents
    const result = await selector.selectAgents(taskDescription, minValidators);

    // Output JSON
    console.log(JSON.stringify(result));
  } catch (error) {
    // Return error response with fallback agents
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: AgentSelection = {
      loop3: ['backend-developer', 'devops-engineer'],
      loop2: ['code-reviewer', 'tester', 'code-quality-validator'],
      product_owner: 'product-owner',
      category: 'default',
      confidence: 0.70
    };

    console.error(`[ERROR] ${errorMessage}`, );
    console.log(JSON.stringify(errorResult));
    process.exit(1);
  }
}

main();
