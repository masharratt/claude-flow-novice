/**
 * Markdown Updater Demo
 *
 * Demonstrates usage of MarkdownUpdater for sprint/phase progress tracking.
 *
 * Usage:
 *   npx tsx examples/markdown-updater-demo.ts
 */

import * as path from 'path';
import {
  createMarkdownUpdater,
  StatusEmoji,
  updateSprintStatusHook,
  updatePhaseStatusHook,
} from '../src/utils/markdown-updater.js';

async function runDemo() {
  console.log('=== Markdown Updater Demo ===\n');

  const updater = createMarkdownUpdater({
    enableBackup: true,
    backupDir: path.join(process.cwd(), '.claude-flow', 'backups'),
    validateAfterUpdate: true,
  });

  const phaseFilePath = path.join(
    process.cwd(),
    'planning/example-epic/phase-1-core-auth.md'
  );

  // Example 1: Update single sprint status
  console.log('Example 1: Update Sprint 1.1 status to IN_PROGRESS...');
  const result1 = await updater.updateSprintStatus(
    phaseFilePath,
    'Sprint 1.1',
    StatusEmoji.IN_PROGRESS
  );
  console.log('Result:', {
    success: result1.success,
    sectionsUpdated: result1.sectionsUpdated,
    errors: result1.errors,
  });
  console.log();

  // Example 2: Update multiple sprints at once
  console.log('Example 2: Update multiple sprints...');
  const result2 = await updater.updateStatus(phaseFilePath, [
    { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.COMPLETE },
    { sectionId: 'Sprint 1.2', newStatus: StatusEmoji.IN_PROGRESS },
    { sectionId: 'Sprint 1.3', newStatus: StatusEmoji.NOT_STARTED },
  ]);
  console.log('Result:', {
    success: result2.success,
    sectionsUpdated: result2.sectionsUpdated,
  });
  console.log();

  // Example 3: Calculate phase completion
  console.log('Example 3: Calculate phase completion...');
  const completion = await updater.calculatePhaseCompletion(phaseFilePath);
  console.log('Phase Completion:', {
    completionPercent: `${completion.completionPercent}%`,
    status: completion.status,
    sprints: completion.sprintStatuses.map((s) => ({
      id: s.id,
      status: s.status,
    })),
  });
  console.log();

  // Example 4: Update phase-level status
  console.log('Example 4: Update phase-level status to IN_PROGRESS...');
  const result4 = await updater.updatePhaseFileStatus(
    phaseFilePath,
    StatusEmoji.IN_PROGRESS
  );
  console.log('Result:', {
    success: result4.success,
    sectionsUpdated: result4.sectionsUpdated,
  });
  console.log();

  // Example 5: Complete all sprints and update phase
  console.log('Example 5: Complete all sprints and update phase status...');
  await updater.updateStatus(phaseFilePath, [
    { sectionId: 'Sprint 1.1', newStatus: StatusEmoji.COMPLETE },
    { sectionId: 'Sprint 1.2', newStatus: StatusEmoji.COMPLETE },
    { sectionId: 'Sprint 1.3', newStatus: StatusEmoji.COMPLETE },
    { sectionId: 'Sprint 1.4', newStatus: StatusEmoji.COMPLETE },
    { sectionId: 'Sprint 1.5', newStatus: StatusEmoji.COMPLETE },
  ]);

  const finalCompletion = await updater.calculatePhaseCompletion(phaseFilePath);
  console.log('Phase Completion:', {
    completionPercent: `${finalCompletion.completionPercent}%`,
    status: finalCompletion.status,
  });

  if (finalCompletion.status === StatusEmoji.COMPLETE) {
    await updater.updatePhaseFileStatus(phaseFilePath, StatusEmoji.COMPLETE);
    console.log('Phase marked as COMPLETE ✅');
  }
  console.log();

  // Example 6: Integration with SprintOrchestrator pattern
  console.log('Example 6: Integration helper hook...');
  try {
    await updateSprintStatusHook(
      updater,
      phaseFilePath,
      'Sprint 1.1',
      StatusEmoji.IN_PROGRESS
    );
    console.log('Sprint status updated via hook successfully');
  } catch (error) {
    console.error('Hook failed:', error instanceof Error ? error.message : error);
  }
  console.log();

  console.log('=== Demo Complete ===');
  console.log(
    `Backup files created in: ${path.join(process.cwd(), '.claude-flow/backups')}`
  );
}

// Run demo
runDemo().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
