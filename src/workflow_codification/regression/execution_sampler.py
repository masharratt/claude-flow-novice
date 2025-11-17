"""
Execution Sampler

Implements stratified sampling to ensure diversity in regression test suites.
Samples proportionally by team to represent real usage patterns.
"""

import random
from collections import defaultdict
from typing import List, Dict


class ExecutionSampler:
    """Stratified sampling for diverse test suite generation"""

    @staticmethod
    def stratified_sample(
        executions: List[Dict],
        sample_size: int,
        strata_key: str = 'team_invoked_by'
    ) -> List[Dict]:
        """
        Perform stratified sampling to ensure diversity

        Samples proportionally from each stratum (team) to ensure
        representation matches actual usage patterns.

        Args:
            executions: List of execution records
            sample_size: Target number of samples
            strata_key: Field to stratify by (default: team_invoked_by)
                       For nested keys like metadata->team, extract during grouping

        Returns:
            Sampled executions with proportional representation
        """
        if len(executions) <= sample_size:
            return executions

        # Group by strata
        strata = defaultdict(list)
        for execution in executions:
            # Handle nested metadata keys
            if strata_key == 'metadata':
                strata_value = execution.get('metadata', {}).get('team', 'unknown')
            else:
                strata_value = execution.get(strata_key, "unknown")
            strata[strata_value].append(execution)

        # Calculate proportional allocation
        total_executions = len(executions)
        samples = []

        for strata_value, strata_executions in strata.items():
            # Proportional sample size (minimum 1 per stratum)
            strata_size = len(strata_executions)
            strata_sample_size = max(
                1,  # Minimum 1 per stratum
                int((strata_size / total_executions) * sample_size)
            )

            # Random sample from this stratum
            strata_sample = random.sample(
                strata_executions,
                min(strata_sample_size, len(strata_executions))
            )
            samples.extend(strata_sample)

        # If we have too many samples (due to minimum per stratum), trim to sample_size
        if len(samples) > sample_size:
            samples = random.sample(samples, sample_size)

        return samples

    @staticmethod
    def set_seed(seed: int):
        """Set random seed for reproducible sampling"""
        random.seed(seed)
