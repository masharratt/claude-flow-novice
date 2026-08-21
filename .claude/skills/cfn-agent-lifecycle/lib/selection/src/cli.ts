#!/usr/bin/env node

import { AgentSelector, AgentSelection } from './agent-selector';
import * as path from 'path';

/**
 * CLI entry point for agent selection
 *
 * Ships as a bundled CommonJS executable, not run from source. Build with
 * `npm run build:agent-selection` (esbuild -> dist/cli.cjs) and invoke the
 * bundle directly:
 *   node .claude/skills/cfn-agent-lifecycle/lib/selection/dist/cli.cjs "task description" [--min-validators N]
 * execute.sh's --typescript path execs dist/cli.cjs; there is no ts-node
 * runtime path because consuming projects reach this skill through the
 * ~/.claude/skills reverse symlink with no node_modules installed there.
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

    // Create selector with proper paths.
    // agent-mappings.json and the agent profiles ship inside the CFN skill tree
    // and are never copied per project, so they are resolved from THIS MODULE's
    // own location. The old process.cwd() form looked inside whichever project
    // invoked the skill, where neither file exists.
    // src/ and dist/ are siblings, so these depths hold for both.
    // selectionDir is .claude/skills/cfn-agent-lifecycle/lib/selection, so
    // .claude is FOUR levels up (selection -> lib -> cfn-agent-lifecycle -> skills).
    const selectionDir = path.resolve(__dirname, '..');
    const mappingsPath = path.join(selectionDir, 'agent-mappings.json');
    const agentsDir = path.resolve(
      selectionDir, '..', '..', '..', '..', 'agents', 'cfn-dev-team'
    );

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
