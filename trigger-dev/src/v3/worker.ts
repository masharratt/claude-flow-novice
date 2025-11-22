import { configure } from '@trigger.dev/sdk/v3';
import { cfnLoopV3Task } from './cfn-loop.task';

// Configure the SDK client from env (TRIGGER_API_KEY/TRIGGER_API_URL)
configure({});

// Export tasks so the trigger.dev build/worker can discover them
export const tasks = {
  cfnLoopV3Task,
};

export default tasks;
