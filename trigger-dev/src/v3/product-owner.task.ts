import { task } from '@trigger.dev/sdk/v3';
import { ProductOwnerDecision } from '../types/cfn-types';

export interface ProductOwnerTaskPayload {
  taskId: string;
  iteration: number;
  gatePassed?: boolean;
  consensusMet?: boolean;
}

export const productOwnerTask = task({
  id: 'cfn-product-owner',
  run: async (payload: ProductOwnerTaskPayload): Promise<ProductOwnerDecision> => {
    const canProceed = payload.gatePassed && payload.consensusMet;
    const shouldProceed = canProceed && payload.iteration >= 5;

    return {
      decision: shouldProceed ? 'PROCEED' : 'ITERATE',
      reasoning: shouldProceed
        ? 'Gate and consensus satisfied with sufficient iterations'
        : 'Additional iteration required to meet PO expectations',
      decidedAt: new Date().toISOString(),
    };
  },
});
