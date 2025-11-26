#!/usr/bin/env node

/**
 * CLI entry point for Skill Propagation System
 * Provides command-line interface for propagating skill updates
 */

import { NodeFileSystemAdapter } from './file-system-adapter';
import { SQLiteDatabaseAdapter } from './database-adapter';
import { ConsoleLogger } from './logger';
import { SkillPropagator } from './skill-propagator';
import type { SkillPropagationOptions } from './types';

const logger = new ConsoleLogger({ debug: process.env['DEBUG'] === '1' });

async function main() {
  const args = process.argv.slice(2);

  // Parse command-line arguments
  const skillName = args[0];
  const newVersion = args[1];
  const updatePath = args[2];
  const changeType = (args[3] || 'patch') as 'patch' | 'minor' | 'major';
  const notifyAgents = args[4] === 'true' ? true : false;

  // Validate minimum arguments
  if (!skillName || !newVersion || !updatePath) {
    logger.error('Missing required arguments');
    logger.error('Usage: propagate-skill-update SKILL_NAME NEW_VERSION UPDATE_PATH [CHANGE_TYPE] [NOTIFY_AGENTS]');
    process.exit(1);
  }

  try {
    // Create adapters
    const fs = new NodeFileSystemAdapter();
    const databasePath = process.env['CFN_SKILLS_DB_PATH'] || './.claude/skills-database/skills.db';
    const db = new SQLiteDatabaseAdapter(databasePath);

    // Create propagator
    const propagator = new SkillPropagator(fs, db, logger);

    // Prepare options
    const options: SkillPropagationOptions = {
      skillName,
      newVersion,
      updatePath,
      changeType,
      notifyAgents,
      databasePath,
      phase4PostgresHost: process.env['PHASE4_POSTGRES_HOST'],
      phase4PostgresDb: process.env['PHASE4_POSTGRES_DB'] || 'workflow_codification',
      phase4PostgresUser: process.env['PHASE4_POSTGRES_USER'],
      phase4PostgresPass: process.env['PHASE4_POSTGRES_PASS'],
      enableAgentNotifications: process.env['ENABLE_AGENT_NOTIFICATIONS'] === 'true',
      debug: process.env['DEBUG'] === '1',
    };

    // Execute propagation
    await propagator.propagate(options);

    logger.success(`Propagation completed successfully`);
    process.exit(0);
  } catch (error) {
    logger.error(`Propagation failed: ${(error as Error).message}`);
    if (process.env['DEBUG'] === '1') {
      console.error(error);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
