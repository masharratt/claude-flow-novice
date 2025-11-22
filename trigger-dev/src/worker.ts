import { configure } from '@trigger.dev/sdk/v3';
import { cfnLoopV3Task } from './cfn-loop.task';
import { gateCheckTask } from './gate-check.task';
import { loop3AgentTask } from './loop3-agent.task';
import { loop2ValidatorTask } from './loop2-validator.task';
import { productOwnerTask } from './product-owner.task';

// Configure the SDK client from env (TRIGGER_API_KEY/TRIGGER_API_URL)
configure({});

// Export tasks so the trigger.dev build/worker can discover them
export const tasks = {
  cfnLoopV3Task,
  gateCheckTask,
  loop3AgentTask,
  loop2ValidatorTask,
  productOwnerTask,
};

export default tasks;
