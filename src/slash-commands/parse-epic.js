#!/usr/bin/env node

/**
 * /parse-epic Slash Command
 *
 * Parses natural language epic markdown files into structured JSON configuration
 *
 * Usage:
 *   /parse-epic <epic-directory> [--output <output-file>] [--validate]
 *   /parse-epic planning/example-epic
 *   /parse-epic planning/my-epic --output epic-config.json --validate
 */

import { SlashCommand } from '../core/slash-command.js';
import { EpicParser } from '../parsers/epic-parser.ts';
import * as path from 'path';
import * as fs from 'fs';

export class ParseEpicCommand extends SlashCommand {
  constructor() {
    super('parse-epic', 'Parse natural language epic documents to structured JSON');
  }

  /**
   * Execute the parse-epic command
   */
  async execute(args) {
    try {
      console.log('🔍 Epic Parser - Natural Language to Structured JSON\n');

      // Parse arguments
      const { epicDirectory, outputFile, validate, overviewFile } = this.parseArgs(args);

      // Validate epic directory exists
      const absoluteEpicDir = path.resolve(epicDirectory);
      if (!fs.existsSync(absoluteEpicDir)) {
        throw new Error(`Epic directory not found: ${epicDirectory}`);
      }

      console.log(`📂 Epic directory: ${epicDirectory}`);
      if (overviewFile) {
        console.log(`📄 Overview file: ${overviewFile}`);
      }
      console.log('');

      // Create parser instance
      const parser = new EpicParser({
        epicDirectory: absoluteEpicDir,
        overviewFile,
        outputFile,
        validateSchema: validate,
      });

      // Parse epic
      console.log('⚙️  Parsing epic documents...\n');
      const epicConfig = parser.parse();

      // Display summary
      this.displaySummary(epicConfig);

      // Validate if requested
      if (validate) {
        console.log('\n🔍 Validating epic configuration...');
        const validationResult = EpicParser.validate(epicConfig);

        if (validationResult.valid) {
          console.log('✅ Validation passed - epic config is valid\n');
        } else {
          console.log('❌ Validation failed:\n');
          validationResult.errors.forEach(error => {
            console.log(`   - ${error}`);
          });
          console.log('');
        }
      }

      // Save to file
      const outputPath = outputFile
        ? path.resolve(outputFile)
        : path.join(absoluteEpicDir, 'epic-config.json');

      fs.writeFileSync(outputPath, JSON.stringify(epicConfig, null, 2), 'utf-8');

      console.log(`💾 Epic config saved to: ${path.relative(process.cwd(), outputPath)}`);
      console.log('✅ Epic parsing complete!\n');

      return {
        success: true,
        epicConfig,
        outputFile: outputPath,
      };
    } catch (error) {
      console.error('❌ Epic parsing failed:', error.message);
      throw error;
    }
  }

  /**
   * Parse command arguments
   */
  parseArgs(args) {
    if (!args || args.length === 0) {
      throw new Error('Usage: /parse-epic <epic-directory> [--output <file>] [--validate] [--overview <file>]');
    }

    const epicDirectory = args[0];
    let outputFile = null;
    let validate = false;
    let overviewFile = null;

    // Parse flags
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--output' || args[i] === '-o') {
        outputFile = args[++i];
      } else if (args[i] === '--validate' || args[i] === '-v') {
        validate = true;
      } else if (args[i] === '--overview') {
        overviewFile = args[++i];
      }
    }

    return { epicDirectory, outputFile, validate, overviewFile };
  }

  /**
   * Display epic summary
   */
  displaySummary(epicConfig) {
    console.log('📋 Epic Summary:');
    console.log(`   ID: ${epicConfig.epicId}`);
    console.log(`   Name: ${epicConfig.name}`);
    console.log(`   Status: ${this.getStatusEmoji(epicConfig.status)} ${epicConfig.status}`);
    console.log(`   Owner: ${epicConfig.owner}`);
    console.log(`   Duration: ${epicConfig.estimatedDuration}`);
    console.log(`   Phases: ${epicConfig.phases.length}`);

    const totalSprints = epicConfig.phases.reduce((sum, phase) => sum + phase.sprints.length, 0);
    console.log(`   Total Sprints: ${totalSprints}`);

    if (epicConfig.epicAcceptanceCriteria.length > 0) {
      console.log(`   Acceptance Criteria: ${epicConfig.epicAcceptanceCriteria.length}`);
    }

    if (epicConfig.crossPhaseDependencies.length > 0) {
      console.log(`   Cross-Phase Dependencies: ${epicConfig.crossPhaseDependencies.length}`);
    }

    console.log('\n📦 Phases:');
    epicConfig.phases.forEach((phase, idx) => {
      console.log(`   ${idx + 1}. ${phase.name} (${phase.sprints.length} sprints) - ${this.getStatusEmoji(phase.status)}`);
    });
  }

  /**
   * Get status emoji
   */
  getStatusEmoji(status) {
    switch (status) {
      case 'completed':
        return '✅';
      case 'in_progress':
        return '🔄';
      default:
        return '❌';
    }
  }

  /**
   * Get command help text
   */
  getHelp() {
    return `
📖 /parse-epic - Epic Document Parser

**Description**:
  Parses natural language epic markdown documents (EPIC_OVERVIEW.md, phase-*.md)
  into structured JSON configuration for project management and automation.

**Usage**:
  /parse-epic <epic-directory> [options]

**Arguments**:
  <epic-directory>       Path to epic directory containing EPIC_OVERVIEW.md and phase files

**Options**:
  --output, -o <file>    Output JSON file path (default: epic-config.json in epic directory)
  --validate, -v         Validate epic config against schema
  --overview <file>      Custom overview file path (default: EPIC_OVERVIEW.md)

**Examples**:
  /parse-epic planning/example-epic
  /parse-epic planning/auth-system --output config/auth-epic.json
  /parse-epic planning/my-epic --validate
  /parse-epic planning/custom --overview planning/custom/OVERVIEW.md

**Detected Patterns**:
  - Epic metadata: **Epic ID**, **Status**, **Owner**, **Estimated Duration**
  - Phase files: **File**: \`path/to/phase.md\` or auto-detect phase-*.md
  - Sprint sections: ### Sprint X.Y: Title
  - Status emojis: ❌ (not started), 🔄 (in progress), ✅ (completed)
  - Dependencies: **Dependencies**: Sprint 1.1, Sprint 1.2
  - Acceptance criteria: Bullet points under **Acceptance Criteria**
  - Tasks: Numbered list under **Tasks**
  - Deliverables: Bullet points under **Deliverables**
  - Cross-phase dependencies: Detected in **Notes** section

**Output Schema**:
  {
    "epicId": "string",
    "name": "string",
    "description": "string",
    "status": "not_started|in_progress|completed",
    "owner": "string",
    "estimatedDuration": "string",
    "overviewFile": "string",
    "phases": [
      {
        "phaseId": "string",
        "name": "string",
        "description": "string",
        "file": "string",
        "status": "string",
        "dependencies": ["string"],
        "estimatedDuration": "string",
        "sprints": [...]
      }
    ],
    "epicAcceptanceCriteria": ["string"],
    "crossPhaseDependencies": [...]
  }

**Integration**:
  - Use parsed config with /cfn-loop for epic execution
  - Use with /fullstack for multi-phase development
  - Export to project management tools (Jira, Asana, etc.)

**Reference**:
  - Example epic: planning/example-epic/
  - Schema: src/parsers/epic-parser-types.ts
`;
  }
}

// Export command instance for registration
export const parseEpicCommand = new ParseEpicCommand();

/**
 * Execute parse-epic command
 */
export async function executeParseEpicCommand(args) {
  const command = new ParseEpicCommand();
  return await command.execute(args);
}

export default ParseEpicCommand;
