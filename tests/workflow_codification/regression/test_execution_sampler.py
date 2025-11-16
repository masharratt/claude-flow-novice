"""
Tests for execution_sampler.py module

Tests stratified sampling algorithm for ensuring diversity in test suite.
"""

import pytest
import random


class TestExecutionSampler:
    """Test suite for ExecutionSampler class"""

    def test_stratified_sample_proportional(self, sample_execution_traces):
        """Verify proportional allocation by team (70% team-a, 30% team-b)"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        # Sample execution traces has 70 team-a, 30 team-b
        ExecutionSampler.set_seed(42)  # Reproducible
        sampled = ExecutionSampler.stratified_sample(
            sample_execution_traces,
            sample_size=50,
            strata_key='metadata'  # Will extract team from metadata
        )

        # Count teams in sample
        team_a_count = sum(1 for ex in sampled if ex['metadata']['team'] == 'team-a')
        team_b_count = sum(1 for ex in sampled if ex['metadata']['team'] == 'team-b')

        # Should be roughly 35 team-a, 15 team-b (70/30 split)
        assert 30 <= team_a_count <= 40  # Allow some variance
        assert 10 <= team_b_count <= 20

    def test_sample_size_enforcement(self, sample_execution_traces):
        """Request 50 samples, get exactly 50"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        ExecutionSampler.set_seed(42)
        sampled = ExecutionSampler.stratified_sample(sample_execution_traces, sample_size=50)

        assert len(sampled) == 50

    def test_minimum_per_stratum(self):
        """Ensure minimum 1 sample per team"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        # 100 executions: 95 team-a, 5 team-b
        executions = [
            {"metadata": {"team": "team-a"}, "id": i} for i in range(95)
        ] + [
            {"metadata": {"team": "team-b"}, "id": i} for i in range(95, 100)
        ]

        ExecutionSampler.set_seed(42)
        sampled = ExecutionSampler.stratified_sample(executions, sample_size=10, strata_key='metadata')

        teams = set(ex['metadata']['team'] for ex in sampled)
        assert 'team-b' in teams  # Even with only 5% representation

    def test_fewer_executions_than_sample_size(self, small_execution_set):
        """If 20 executions available, sample_size=50 → return all 20"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        sampled = ExecutionSampler.stratified_sample(small_execution_set, sample_size=50)

        assert len(sampled) == 20  # Return all available

    def test_reproducible_with_seed(self, sample_execution_traces):
        """random.seed(42) → consistent results"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        ExecutionSampler.set_seed(42)
        sample1 = ExecutionSampler.stratified_sample(sample_execution_traces, sample_size=30)

        ExecutionSampler.set_seed(42)
        sample2 = ExecutionSampler.stratified_sample(sample_execution_traces, sample_size=30)

        # Same seed → same sample
        assert [ex['trace_id'] for ex in sample1] == [ex['trace_id'] for ex in sample2]

    def test_empty_executions(self):
        """Empty list → empty sample"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        sampled = ExecutionSampler.stratified_sample([], sample_size=50)
        assert sampled == []

    def test_single_stratum(self):
        """One team → all samples from that team"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        executions = [
            {"metadata": {"team": "team-a"}, "id": i} for i in range(100)
        ]

        sampled = ExecutionSampler.stratified_sample(executions, sample_size=20)

        assert len(sampled) == 20
        assert all(ex['metadata']['team'] == 'team-a' for ex in sampled)

    def test_multiple_strata(self):
        """Multiple teams → proportional distribution"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        # 3 teams: 50% team-a, 30% team-b, 20% team-c
        executions = (
            [{"metadata": {"team": "team-a"}, "id": i} for i in range(50)] +
            [{"metadata": {"team": "team-b"}, "id": i} for i in range(50, 80)] +
            [{"metadata": {"team": "team-c"}, "id": i} for i in range(80, 100)]
        )

        ExecutionSampler.set_seed(42)
        sampled = ExecutionSampler.stratified_sample(executions, sample_size=30, strata_key='metadata')

        team_a = sum(1 for ex in sampled if ex['metadata']['team'] == 'team-a')
        team_b = sum(1 for ex in sampled if ex['metadata']['team'] == 'team-b')
        team_c = sum(1 for ex in sampled if ex['metadata']['team'] == 'team-c')

        # Should be roughly 15, 9, 6 (50/30/20 split of 30 samples)
        assert team_a > team_b > team_c  # Proportional ordering
        assert team_a + team_b + team_c == 30

    def test_edge_case_sample_size_one(self):
        """sample_size=1 → one sample"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        executions = [{"metadata": {"team": "team-a"}, "id": i} for i in range(100)]

        sampled = ExecutionSampler.stratified_sample(executions, sample_size=1)
        assert len(sampled) == 1

    def test_max_sample_trimming(self):
        """If proportional allocation > sample_size, trim to exact size"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        # Many strata, each gets minimum 1 → total > sample_size
        executions = []
        for team_id in range(20):  # 20 teams
            executions.extend([
                {"metadata": {"team": f"team-{team_id}"}, "id": f"{team_id}-{i}"}
                for i in range(10)
            ])

        ExecutionSampler.set_seed(42)
        sampled = ExecutionSampler.stratified_sample(executions, sample_size=15)

        # Even with 20 teams (each wants minimum 1), trim to exactly 15
        assert len(sampled) == 15

    def test_strata_key_extraction(self):
        """Test different strata_key formats"""
        from src.workflow_codification.regression.execution_sampler import ExecutionSampler

        # Nested metadata
        executions = [
            {"metadata": {"team": "team-a"}, "id": i} for i in range(50)
        ] + [
            {"metadata": {"team": "team-b"}, "id": i} for i in range(50, 100)
        ]

        sampled = ExecutionSampler.stratified_sample(executions, sample_size=20, strata_key='metadata')

        # Should have both teams represented
        teams = set(ex['metadata']['team'] for ex in sampled)
        assert len(teams) >= 2
