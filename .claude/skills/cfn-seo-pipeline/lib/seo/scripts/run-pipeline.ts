#!/usr/bin/env ts-node
/**
 * CLI Command: Run SEO Pipeline - Phase 1 Sprint 4
 *
 * @module planning/seo/scripts/run-pipeline
 * @description Command-line interface to execute the SEO intelligence pipeline
 */

import { PipelineOrchestrator } from '../lib/pipeline-orchestrator';
import { IntelligenceCurator } from '../lib/intelligence-curator';
import { PatternManager } from '../lib/pattern-manager';
import { RedisContextStore } from '../lib/redis-context-store';

/**
 * Parse command-line arguments
 */
interface CliArgs {
  targetKeyword: string;
  contentType: string;
  industry?: string;
  competitorDomains?: string[];
  verbose?: boolean;
  help?: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    targetKeyword: '',
    contentType: '',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--keyword':
      case '-k':
        result.targetKeyword = args[++i];
        break;

      case '--content-type':
      case '-c':
        result.contentType = args[++i];
        break;

      case '--industry':
      case '-i':
        result.industry = args[++i];
        break;

      case '--competitors':
        result.competitorDomains = args[++i].split(',').map((d) => d.trim());
        break;

      case '--verbose':
      case '-v':
        result.verbose = true;
        break;

      case '--help':
      case '-h':
        result.help = true;
        break;

      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  return result;
}

/**
 * Display help message
 */
function displayHelp(): void {
  console.log(`
SEO Intelligence Pipeline - CLI

Usage:
  npm run pipeline -- [options]

Options:
  -k, --keyword <keyword>          Target keyword for SEO content (required)
  -c, --content-type <type>        Content type (blog, guide, article, etc.) (required)
  -i, --industry <industry>        Target industry (optional)
  --competitors <domains>          Comma-separated competitor domains (optional)
  -v, --verbose                    Enable verbose logging
  -h, --help                       Display this help message

Examples:
  # Basic usage
  npm run pipeline -- --keyword "TypeScript tutorial" --content-type "guide"

  # With industry and competitors
  npm run pipeline -- \\
    --keyword "React best practices" \\
    --content-type "blog" \\
    --industry "software" \\
    --competitors "example.com,competitor.com"

  # Verbose mode
  npm run pipeline -- -k "SEO tips" -c "article" -v

Pipeline Steps:
  Step 0:  Intelligence Pre-load (load patterns and intelligence)
  Step 1:  Keyword Research
  Step 2:  Competitor Analysis
  Step 3:  Content Planning
  Step 4:  Content Outline
  Step 5:  Content Writing
  Step 6:  SEO Optimization
  Step 7:  Technical SEO
  Step 8:  Link Building Strategy
  Step 9:  Content Publishing
  Step 10: Performance Monitoring
  Step 11: Continuous Improvement
  Step 12: Learning Capture (update pattern confidence)

Output:
  - Task ID
  - Execution status (success/failure)
  - Steps completed
  - Patterns applied count
  - Learnings captured count
  - Total execution time
  `);
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Display help if requested
  if (args.help) {
    displayHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!args.targetKeyword) {
    console.error('Error: --keyword is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  if (!args.contentType) {
    console.error('Error: --content-type is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  console.log('SEO Intelligence Pipeline');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Create pipeline task
    const task = PipelineOrchestrator.createTask(args.targetKeyword, args.contentType, {
      industry: args.industry,
      competitorDomains: args.competitorDomains,
    });

    // Validate task
    const validationErrors = PipelineOrchestrator.validateTask(task);
    if (validationErrors.length > 0) {
      console.error('Task validation failed:');
      validationErrors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }

    // Display task details
    console.log('Task Configuration:');
    console.log(`  Task ID: ${task.taskId}`);
    console.log(`  Target Keyword: ${task.targetKeyword}`);
    console.log(`  Content Type: ${task.contentType}`);
    console.log(`  Industry: ${task.industry || 'N/A'}`);
    console.log(`  Competitors: ${task.competitorDomains?.join(', ') || 'N/A'}`);
    console.log('');

    // Initialize components
    if (args.verbose) {
      console.log('Initializing pipeline components...');
    }

    const intelligenceCurator = new IntelligenceCurator({ verbose: args.verbose });
    const patternManager = new PatternManager({ verbose: args.verbose });
    const redisContextStore = new RedisContextStore({ verbose: args.verbose });

    // Create orchestrator
    const orchestrator = new PipelineOrchestrator({
      intelligenceCurator,
      patternManager,
      redisContextStore,
      verbose: args.verbose,
    });

    // Execute pipeline
    console.log('Executing pipeline...');
    console.log('');

    const result = await orchestrator.execute(task);

    // Display results
    console.log('');
    console.log('='.repeat(80));
    console.log('Pipeline Execution Complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('Results:');
    console.log(`  Status: ${result.status.toUpperCase()}`);
    console.log(`  Steps Completed: ${result.stepsCompleted}/${result.totalSteps}`);
    console.log(`  Patterns Applied: ${result.patternsApplied}`);
    console.log(`  Learnings Captured: ${result.learningsCaptured}`);
    console.log(`  Execution Time: ${result.executionTimeMs}ms`);

    if (result.error) {
      console.log('');
      console.log('Error Details:');
      console.log(`  Step: ${result.error.step}`);
      console.log(`  Message: ${result.error.message}`);
      console.log(`  Code: ${result.error.code || 'N/A'}`);
    }

    console.log('');

    // Exit with appropriate code
    process.exit(result.status === 'success' ? 0 : 1);
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('Pipeline Execution Failed');
    console.error('='.repeat(80));
    console.error('');
    console.error('Error:', error instanceof Error ? error.message : String(error));

    if (args.verbose && error instanceof Error && error.stack) {
      console.error('');
      console.error('Stack Trace:');
      console.error(error.stack);
    }

    console.error('');
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
