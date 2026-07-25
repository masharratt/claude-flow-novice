/**
 * useIntervention Hook
 *
 * React Query mutation hook for performing intervention actions on agents
 * (pause, resume, terminate, restart, update_config)
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient } from '../../services/ApiClient';
import type { ApiResponse, InterventionRequest, InterventionResponse } from '../../types/api';
import { queryKeys } from '../../types/api';

interface UseInterventionOptions {
  onSuccess?: (data: ApiResponse<InterventionResponse>, variables: InterventionVariables) => void;
  onError?: (error: Error, variables: InterventionVariables) => void;
}

interface InterventionVariables {
  agentId: string;
  request: InterventionRequest;
}

export function useIntervention(
  options: UseInterventionOptions = {}
): UseMutationResult<ApiResponse<InterventionResponse>, Error, InterventionVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, request }: InterventionVariables) =>
      apiClient.interventeAgent(agentId, request),
    onSuccess: (data, variables) => {
      // Invalidate related queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.status(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.hierarchy() });
      queryClient.invalidateQueries({ queryKey: queryKeys.resources.all() });

      // Call custom onSuccess if provided
      options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      // Call custom onError if provided
      options.onError?.(error, variables);
    },
    retry: 1, // Only retry once for mutations
    retryDelay: 1000,
  });
}

export default useIntervention;
