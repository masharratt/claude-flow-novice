import { task } from '@trigger.dev/sdk/v3';
import { ProductOwnerDecision } from '../types/cfn-types';

export interface ProductOwnerTaskPayload {
  taskId: string;
  iteration: number;
}

export const productOwnerTask = task({
  id: 'cfn-product-owner',
  run: async (payload: ProductOwnerTaskPayload): Promise<ProductOwnerDecision> => {
    return {
      decision: payload.iteration >= 5 ? 'PROCEED' : 'ITERATE',
      reasoning: payload.iteration >= 5 ? 'All criteria met (simulated)' : 'Needs more iterations (simulated)',
      decidedAt: new Date().toISOString(),
    };
  },
});
