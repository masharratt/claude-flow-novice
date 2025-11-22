/**
 * trigger.dev Worker Entry Point (v2 SDK)
 * Registers all CFN Loop jobs with the trigger.dev server
 */

import { TriggerClient } from '@trigger.dev/sdk';
import { cfnLoopWorkflow } from './workflows/cfn-loop';
import { cfnAgentJob } from './jobs/cfn-agent';
import { cfnGateCheckJob } from './jobs/cfn-gate-check';

// Initialize trigger.dev client
const client = new TriggerClient({
  id: 'cfn-loop-worker',
  apiKey: process.env.TRIGGER_API_KEY!,
  apiUrl: process.env.TRIGGER_API_URL || 'http://localhost:3040',
});

// Explicitly register jobs with the client (v3 SDK requirement)
client.defineJob(cfnLoopWorkflow);
client.defineJob(cfnAgentJob);
client.defineJob(cfnGateCheckJob);

// Export jobs for reference
export const jobs = {
  cfnLoopWorkflow,
  cfnAgentJob,
  cfnGateCheckJob,
};

// Export client for use in jobs
export { client };
export default client;

// Self-invoking registration
if (require.main === module) {
  console.log('Starting CFN Loop trigger.dev worker...');
  console.log(`API URL: ${process.env.TRIGGER_API_URL || 'http://localhost:3040'}`);
  console.log('Registered jobs:');
  Object.keys(jobs).forEach((name) => console.log(`  - ${name}`));
}
