/**
 * CFN Deliverable Job - Creates REAL file deliverables
 *
 * This job writes actual files to disk, enabling verification
 * that the trigger.dev pipeline produces real outputs.
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateTaskId, validateFilename } from '../utils/path-validation';

// Declare client for external initialization
declare const client: TriggerClient;

export interface DeliverablePayload {
  taskId: string;
  outputDir: string;
  content?: string;
  agentType?: string;
  files?: string[];
  summary?: string;
}

export const cfnDeliverableJob = defineJob({
  id: 'cfn-deliverable-job',
  name: 'CFN Deliverable Creation',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.deliverable.create',
  }),
  run: async (payload: DeliverablePayload, io, ctx) => {
    const {
      taskId,
      outputDir,
      content,
      agentType = 'backend-developer',
      files = [],
      summary = 'Deliverable created by CFN Loop',
    } = payload;

    await io.logger.log('Creating deliverable', { taskId, outputDir });

    try {
      // SECURITY FIX: Validate taskId to prevent path traversal attacks
      validateTaskId(taskId);

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Build deliverable content
      const deliverableContent = content || JSON.stringify({
        taskId,
        agentType,
        createdAt: new Date().toISOString(),
        files,
        summary,
      }, null, 2);

      // Write deliverable file
      const filePath = path.join(outputDir, `${taskId}.txt`);
      await fs.writeFile(filePath, deliverableContent, 'utf-8');

      await io.logger.log('Deliverable created', { taskId, filePath });

      return {
        success: true,
        taskId,
        filePath,
        createdAt: new Date().toISOString(),
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = error.code || 'UNKNOWN';

      await io.logger.error('Deliverable creation failed', {
        taskId,
        outputDir,
        error: errorMessage,
        errorCode,
      });

      // Return error result instead of throwing (graceful degradation)
      return {
        success: false,
        taskId,
        filePath: null,
        error: errorMessage,
        errorCode,
        createdAt: new Date().toISOString(),
      };
    }
  },
});

export default cfnDeliverableJob;
