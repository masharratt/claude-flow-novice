"""
Comprehensive test suite for Skill Composition Framework
Following TDD protocol - tests written BEFORE implementation
"""

import pytest
import os
import json
import tempfile
import shutil
from typing import Dict, List


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def sample_composite_linear():
    """Linear dependency chain: A -> B -> C"""
    return {
        "name": "linear-workflow",
        "steps": [
            {
                "step_id": "step_a",
                "skill_name": "skill-a",
                "params": {"input": "data"}
            },
            {
                "step_id": "step_b",
                "skill_name": "skill-b",
                "params": {},
                "depends_on": ["step_a"]
            },
            {
                "step_id": "step_c",
                "skill_name": "skill-c",
                "params": {},
                "depends_on": ["step_b"]
            }
        ]
    }


@pytest.fixture
def sample_composite_diamond():
    """Diamond pattern: A -> B,C -> D"""
    return {
        "name": "diamond-workflow",
        "steps": [
            {
                "step_id": "step_a",
                "skill_name": "skill-a",
                "params": {}
            },
            {
                "step_id": "step_b",
                "skill_name": "skill-b",
                "params": {},
                "depends_on": ["step_a"]
            },
            {
                "step_id": "step_c",
                "skill_name": "skill-c",
                "params": {},
                "depends_on": ["step_a"]
            },
            {
                "step_id": "step_d",
                "skill_name": "skill-d",
                "params": {},
                "depends_on": ["step_b", "step_c"]
            }
        ]
    }


@pytest.fixture
def sample_composite_circular():
    """Circular dependency: A -> B -> C -> A"""
    return {
        "name": "circular-workflow",
        "steps": [
            {
                "step_id": "step_a",
                "skill_name": "skill-a",
                "params": {},
                "depends_on": ["step_c"]
            },
            {
                "step_id": "step_b",
                "skill_name": "skill-b",
                "params": {},
                "depends_on": ["step_a"]
            },
            {
                "step_id": "step_c",
                "skill_name": "skill-c",
                "params": {},
                "depends_on": ["step_b"]
            }
        ]
    }


@pytest.fixture
def sample_composite_parallel():
    """Fully parallel: A, B, C (no dependencies)"""
    return {
        "name": "parallel-workflow",
        "steps": [
            {"step_id": "step_a", "skill_name": "skill-a", "params": {}},
            {"step_id": "step_b", "skill_name": "skill-b", "params": {}},
            {"step_id": "step_c", "skill_name": "skill-c", "params": {}}
        ]
    }


# ============================================================================
# Test DependencyGraph Class
# ============================================================================

class TestDependencyGraph:
    """Test dependency graph building and analysis"""

    def test_add_step_creates_node(self):
        """Test that adding a step creates a node in the graph"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph()
        graph.add_step("step_a")

        assert "step_a" in graph.nodes
        assert len(graph.nodes) == 1

    def test_add_dependency_creates_edge(self):
        """Test that adding a dependency creates an edge"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph()
        graph.add_dependency("step_a", "step_b")

        assert "step_a" in graph.nodes
        assert "step_b" in graph.nodes
        assert "step_b" in graph.graph["step_a"]
        assert "step_a" in graph.reverse_graph["step_b"]

    def test_circular_dependency_detected(self):
        """Test circular dependency detection: A -> B -> C -> A"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph()
        graph.add_dependency("step_a", "step_b")
        graph.add_dependency("step_b", "step_c")
        graph.add_dependency("step_c", "step_a")

        assert graph.has_circular_dependency() is True

    def test_no_circular_dependency_in_linear_chain(self):
        """Test no circular dependency in linear chain: A -> B -> C"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph()
        graph.add_dependency("step_a", "step_b")
        graph.add_dependency("step_b", "step_c")

        assert graph.has_circular_dependency() is False

    def test_no_circular_dependency_in_diamond(self):
        """Test no circular dependency in diamond: A -> B,C -> D"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph()
        graph.add_dependency("step_a", "step_b")
        graph.add_dependency("step_a", "step_c")
        graph.add_dependency("step_b", "step_d")
        graph.add_dependency("step_c", "step_d")

        assert graph.has_circular_dependency() is False

    def test_from_composite_definition_linear(self, sample_composite_linear):
        """Test building graph from composite definition (linear)"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph.from_composite_definition(sample_composite_linear)

        assert len(graph.nodes) == 3
        assert graph.has_circular_dependency() is False
        assert "step_b" in graph.get_dependents("step_a")
        assert "step_a" in graph.get_prerequisites("step_b")

    def test_from_composite_definition_diamond(self, sample_composite_diamond):
        """Test building graph from composite definition (diamond)"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph.from_composite_definition(sample_composite_diamond)

        assert len(graph.nodes) == 4
        assert graph.has_circular_dependency() is False
        assert "step_a" in graph.get_prerequisites("step_b")
        assert "step_a" in graph.get_prerequisites("step_c")
        assert set(graph.get_prerequisites("step_d")) == {"step_b", "step_c"}

    def test_get_prerequisites_returns_correct_steps(self):
        """Test get_prerequisites returns correct prerequisite steps"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph()
        graph.add_dependency("step_a", "step_c")
        graph.add_dependency("step_b", "step_c")

        prereqs = graph.get_prerequisites("step_c")
        assert set(prereqs) == {"step_a", "step_b"}

    def test_get_dependents_returns_correct_steps(self):
        """Test get_dependents returns correct dependent steps"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph

        graph = DependencyGraph()
        graph.add_dependency("step_a", "step_b")
        graph.add_dependency("step_a", "step_c")

        dependents = graph.get_dependents("step_a")
        assert set(dependents) == {"step_b", "step_c"}


# ============================================================================
# Test TopologicalSorter Class
# ============================================================================

class TestTopologicalSorter:
    """Test topological sorting algorithms"""

    def test_sort_linear_chain(self, sample_composite_linear):
        """Test topological sort on linear chain: A -> B -> C"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph.from_composite_definition(sample_composite_linear)
        sorted_order = TopologicalSorter.sort(graph)

        assert len(sorted_order) == 3
        assert sorted_order.index("step_a") < sorted_order.index("step_b")
        assert sorted_order.index("step_b") < sorted_order.index("step_c")

    def test_sort_diamond_pattern(self, sample_composite_diamond):
        """Test topological sort on diamond: A -> B,C -> D"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph.from_composite_definition(sample_composite_diamond)
        sorted_order = TopologicalSorter.sort(graph)

        assert len(sorted_order) == 4
        assert sorted_order.index("step_a") < sorted_order.index("step_b")
        assert sorted_order.index("step_a") < sorted_order.index("step_c")
        assert sorted_order.index("step_b") < sorted_order.index("step_d")
        assert sorted_order.index("step_c") < sorted_order.index("step_d")

    def test_sort_circular_dependency_raises_error(self, sample_composite_circular):
        """Test that circular dependency raises ValueError"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph.from_composite_definition(sample_composite_circular)

        with pytest.raises(ValueError, match="circular dependency"):
            TopologicalSorter.sort(graph)

    def test_sort_with_levels_linear_chain(self, sample_composite_linear):
        """Test sort_with_levels on linear chain returns 3 levels"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph.from_composite_definition(sample_composite_linear)
        levels = TopologicalSorter.sort_with_levels(graph)

        assert len(levels) == 3
        assert levels[0] == ["step_a"]
        assert levels[1] == ["step_b"]
        assert levels[2] == ["step_c"]

    def test_sort_with_levels_diamond_pattern(self, sample_composite_diamond):
        """Test sort_with_levels groups B and C in same level"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph.from_composite_definition(sample_composite_diamond)
        levels = TopologicalSorter.sort_with_levels(graph)

        assert len(levels) == 3
        assert levels[0] == ["step_a"]
        assert set(levels[1]) == {"step_b", "step_c"}
        assert levels[2] == ["step_d"]

    def test_sort_with_levels_parallel_workflow(self, sample_composite_parallel):
        """Test sort_with_levels puts all parallel steps in one level"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph.from_composite_definition(sample_composite_parallel)
        levels = TopologicalSorter.sort_with_levels(graph)

        assert len(levels) == 1
        assert set(levels[0]) == {"step_a", "step_b", "step_c"}

    def test_sort_disconnected_components(self):
        """Test sorting with disconnected components"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph()
        graph.add_dependency("step_a", "step_b")
        graph.add_dependency("step_c", "step_d")

        sorted_order = TopologicalSorter.sort(graph)
        assert len(sorted_order) == 4
        # Both chains should be represented
        assert sorted_order.index("step_a") < sorted_order.index("step_b")
        assert sorted_order.index("step_c") < sorted_order.index("step_d")


# ============================================================================
# Test Workspace Class
# ============================================================================

class TestWorkspace:
    """Test workspace data sharing"""

    def test_write_output_creates_json_file(self):
        """Test that write_output creates JSON file in workspace"""
        from src.workflow_codification.composition.workspace import Workspace

        workspace = Workspace()
        try:
            data = {"result": "success", "value": 42}
            workspace.write_output("step_a", data)

            output_file = os.path.join(workspace.get_workspace_dir(), "step_a_output.json")
            assert os.path.exists(output_file)

            with open(output_file, 'r') as f:
                loaded_data = json.load(f)
            assert loaded_data == data
        finally:
            workspace.cleanup()

    def test_read_output_from_memory(self):
        """Test that read_output reads from memory cache"""
        from src.workflow_codification.composition.workspace import Workspace

        workspace = Workspace()
        try:
            data = {"result": "success", "value": 42}
            workspace.write_output("step_a", data)

            # Should read from memory
            loaded_data = workspace.read_output("step_a")
            assert loaded_data == data
        finally:
            workspace.cleanup()

    def test_read_output_from_file(self):
        """Test that read_output reads from file when not in memory"""
        from src.workflow_codification.composition.workspace import Workspace

        workspace = Workspace()
        try:
            data = {"result": "success", "value": 42}
            workspace.write_output("step_a", data)

            # Clear memory cache
            workspace.step_outputs = {}

            # Should read from file
            loaded_data = workspace.read_output("step_a")
            assert loaded_data == data
        finally:
            workspace.cleanup()

    def test_read_output_nonexistent_returns_empty_dict(self):
        """Test that reading nonexistent output returns empty dict"""
        from src.workflow_codification.composition.workspace import Workspace

        workspace = Workspace()
        try:
            loaded_data = workspace.read_output("nonexistent_step")
            assert loaded_data == {}
        finally:
            workspace.cleanup()

    def test_get_workspace_dir_returns_correct_path(self):
        """Test that get_workspace_dir returns correct directory path"""
        from src.workflow_codification.composition.workspace import Workspace

        workspace = Workspace()
        try:
            workspace_dir = workspace.get_workspace_dir()
            assert os.path.exists(workspace_dir)
            assert os.path.isdir(workspace_dir)
        finally:
            workspace.cleanup()

    def test_cleanup_removes_directory(self):
        """Test that cleanup removes workspace directory"""
        from src.workflow_codification.composition.workspace import Workspace

        workspace = Workspace()
        workspace_dir = workspace.get_workspace_dir()

        workspace.cleanup()
        assert not os.path.exists(workspace_dir)

    def test_custom_base_dir(self):
        """Test workspace with custom base directory"""
        from src.workflow_codification.composition.workspace import Workspace

        custom_dir = tempfile.mkdtemp(prefix="test_workspace_")
        try:
            workspace = Workspace(base_dir=custom_dir)
            assert workspace.get_workspace_dir() == custom_dir

            data = {"test": "data"}
            workspace.write_output("step_x", data)

            output_file = os.path.join(custom_dir, "step_x_output.json")
            assert os.path.exists(output_file)
        finally:
            if os.path.exists(custom_dir):
                shutil.rmtree(custom_dir)


# ============================================================================
# Test CompositeExecutor Class
# ============================================================================

class TestCompositeExecutor:
    """Test composite workflow execution"""

    @pytest.fixture
    def mock_skills_dir(self):
        """Create mock skills directory for testing"""
        skills_dir = tempfile.mkdtemp(prefix="mock_skills_")

        # Create mock skill scripts
        for skill_name in ["skill-a", "skill-b", "skill-c", "skill-d"]:
            skill_path = os.path.join(skills_dir, skill_name)
            os.makedirs(skill_path, exist_ok=True)

            execute_script = os.path.join(skill_path, "execute.sh")
            with open(execute_script, 'w') as f:
                f.write(f"""#!/bin/bash
echo "Executed {skill_name}"
echo '{{"skill": "{skill_name}", "status": "success"}}'
exit 0
""")
            os.chmod(execute_script, 0o755)

        yield skills_dir
        shutil.rmtree(skills_dir)

    def test_execute_sequential_linear_chain(self, sample_composite_linear, mock_skills_dir, monkeypatch):
        """Test sequential execution of linear chain"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor

        # Monkeypatch the skills directory
        monkeypatch.setattr(
            "src.workflow_codification.composition.composite_executor.CompositeExecutor._build_command",
            lambda self, skill_name, params: f"{mock_skills_dir}/{skill_name}/execute.sh"
        )

        executor = CompositeExecutor()
        result = executor.execute_composite(
            sample_composite_linear,
            execution_mode="sequential",
            error_handling="stop_on_error"
        )

        assert result["status"] == "success"
        assert len(result["step_results"]) == 3
        assert "step_a" in result["step_results"]
        assert "step_b" in result["step_results"]
        assert "step_c" in result["step_results"]

    def test_execute_parallel_diamond_pattern(self, sample_composite_diamond, mock_skills_dir, monkeypatch):
        """Test parallel execution of diamond pattern"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor

        monkeypatch.setattr(
            "src.workflow_codification.composition.composite_executor.CompositeExecutor._build_command",
            lambda self, skill_name, params: f"{mock_skills_dir}/{skill_name}/execute.sh"
        )

        executor = CompositeExecutor()
        result = executor.execute_composite(
            sample_composite_diamond,
            execution_mode="parallel",
            error_handling="stop_on_error"
        )

        assert result["status"] == "success"
        assert len(result["step_results"]) == 4

    def test_stop_on_error_halts_execution(self, mock_skills_dir):
        """Test that stop_on_error halts on first failure"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor

        # Create failing skill
        fail_skill = os.path.join(mock_skills_dir, "skill-fail")
        os.makedirs(fail_skill, exist_ok=True)
        execute_script = os.path.join(fail_skill, "execute.sh")
        with open(execute_script, 'w') as f:
            f.write("#!/bin/bash\necho 'ERROR'\nexit 1\n")
        os.chmod(execute_script, 0o755)

        composite = {
            "name": "fail-test",
            "steps": [
                {"step_id": "step_a", "skill_name": "skill-a", "params": {}},
                {"step_id": "step_fail", "skill_name": "skill-fail", "params": {}, "depends_on": ["step_a"]},
                {"step_id": "step_c", "skill_name": "skill-c", "params": {}, "depends_on": ["step_fail"]}
            ]
        }

        executor = CompositeExecutor()
        executor._build_command = lambda skill_name, params: f"{mock_skills_dir}/{skill_name}/execute.sh"

        result = executor.execute_composite(
            composite,
            execution_mode="sequential",
            error_handling="stop_on_error"
        )

        assert result["status"] == "failed"
        assert result["step_results"]["step_a"]["success"] is True
        assert result["step_results"]["step_fail"]["success"] is False
        # step_c should not be executed
        assert "step_c" not in result["step_results"]

    def test_continue_on_error_completes_workflow(self, mock_skills_dir):
        """Test that continue_on_error completes all steps"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor

        # Create failing skill
        fail_skill = os.path.join(mock_skills_dir, "skill-fail")
        os.makedirs(fail_skill, exist_ok=True)
        execute_script = os.path.join(fail_skill, "execute.sh")
        with open(execute_script, 'w') as f:
            f.write("#!/bin/bash\necho 'ERROR'\nexit 1\n")
        os.chmod(execute_script, 0o755)

        composite = {
            "name": "continue-test",
            "steps": [
                {"step_id": "step_a", "skill_name": "skill-a", "params": {}},
                {"step_id": "step_fail", "skill_name": "skill-fail", "params": {}, "depends_on": ["step_a"]},
                {"step_id": "step_c", "skill_name": "skill-c", "params": {}, "depends_on": ["step_fail"]}
            ]
        }

        executor = CompositeExecutor()
        executor._build_command = lambda skill_name, params: f"{mock_skills_dir}/{skill_name}/execute.sh"

        result = executor.execute_composite(
            composite,
            execution_mode="sequential",
            error_handling="continue_on_error"
        )

        # All steps should be executed
        assert len(result["step_results"]) == 3
        assert result["step_results"]["step_a"]["success"] is True
        assert result["step_results"]["step_fail"]["success"] is False
        assert result["step_results"]["step_c"]["success"] is True

    def test_data_passing_via_workspace(self, mock_skills_dir):
        """Test data passing between steps via workspace"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor

        # Create skill that outputs data
        output_skill = os.path.join(mock_skills_dir, "skill-output")
        os.makedirs(output_skill, exist_ok=True)
        execute_script = os.path.join(output_skill, "execute.sh")
        with open(execute_script, 'w') as f:
            f.write("""#!/bin/bash
echo '{"output_value": "test_data"}'
exit 0
""")
        os.chmod(execute_script, 0o755)

        composite = {
            "name": "data-passing-test",
            "steps": [
                {"step_id": "step_output", "skill_name": "skill-output", "params": {}},
                {"step_id": "step_input", "skill_name": "skill-a", "params": {}, "depends_on": ["step_output"]}
            ]
        }

        executor = CompositeExecutor()
        executor._build_command = lambda skill_name, params: f"{mock_skills_dir}/{skill_name}/execute.sh"

        result = executor.execute_composite(
            composite,
            execution_mode="sequential",
            error_handling="stop_on_error"
        )

        assert result["status"] == "success"
        # Verify workspace was used
        assert result["workspace_dir"] is not None
        assert os.path.exists(result["workspace_dir"])

    def test_step_results_collected(self, sample_composite_linear, mock_skills_dir):
        """Test that step results are properly collected"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor

        executor = CompositeExecutor()
        executor._build_command = lambda skill_name, params: f"{mock_skills_dir}/{skill_name}/execute.sh"

        result = executor.execute_composite(
            sample_composite_linear,
            execution_mode="sequential",
            error_handling="stop_on_error"
        )

        # Verify each step has required fields
        for step_id in ["step_a", "step_b", "step_c"]:
            step_result = result["step_results"][step_id]
            assert "step_id" in step_result
            assert "success" in step_result
            assert "duration" in step_result
            assert "exit_code" in step_result


# ============================================================================
# Integration Tests
# ============================================================================

class TestCompositionIntegration:
    """Integration tests for entire composition framework"""

    def test_end_to_end_linear_workflow(self, sample_composite_linear):
        """Test complete linear workflow from graph to execution"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        # Build graph
        graph = DependencyGraph.from_composite_definition(sample_composite_linear)
        assert graph.has_circular_dependency() is False

        # Sort
        sorted_order = TopologicalSorter.sort(graph)
        assert sorted_order == ["step_a", "step_b", "step_c"]

    def test_end_to_end_diamond_workflow(self, sample_composite_diamond):
        """Test complete diamond workflow with parallel execution"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        # Build graph
        graph = DependencyGraph.from_composite_definition(sample_composite_diamond)
        assert graph.has_circular_dependency() is False

        # Sort with levels
        levels = TopologicalSorter.sort_with_levels(graph)
        assert len(levels) == 3
        assert set(levels[1]) == {"step_b", "step_c"}

    def test_circular_dependency_prevention(self, sample_composite_circular):
        """Test that circular dependencies are prevented"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph.from_composite_definition(sample_composite_circular)
        assert graph.has_circular_dependency() is True

        with pytest.raises(ValueError):
            TopologicalSorter.sort(graph)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])


# ============================================================================
# Additional Tests for 100% Coverage
# ============================================================================

class TestCoverageEdgeCases:
    """Tests for edge cases to achieve 100% coverage"""

    def test_executor_timeout_handling(self):
        """Test timeout handling in composite executor"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor
        import tempfile
        import os

        # Create a slow skill that times out
        skills_dir = tempfile.mkdtemp(prefix="timeout_skills_")
        slow_skill = os.path.join(skills_dir, "slow-skill")
        os.makedirs(slow_skill, exist_ok=True)
        execute_script = os.path.join(slow_skill, "execute.sh")
        with open(execute_script, 'w') as f:
            f.write("#!/bin/bash\nsleep 400\nexit 0\n")
        os.chmod(execute_script, 0o755)

        composite = {
            "name": "timeout-test",
            "steps": [
                {"step_id": "slow_step", "skill_name": "slow-skill", "params": {}}
            ]
        }

        executor = CompositeExecutor()
        # Monkeypatch to use our test skills
        executor._build_command = lambda skill_name, params: f"{skills_dir}/{skill_name}/execute.sh"

        result = executor.execute_composite(
            composite,
            execution_mode="sequential",
            error_handling="stop_on_error"
        )

        # Should fail due to timeout
        assert result["status"] == "failed"
        assert "slow_step" in result["step_results"]
        assert result["step_results"]["slow_step"]["success"] is False

        # Cleanup
        import shutil
        shutil.rmtree(skills_dir)

    def test_topological_sort_empty_graph(self):
        """Test topological sort on empty graph"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph()
        sorted_order = TopologicalSorter.sort(graph)
        assert sorted_order == []

    def test_topological_sort_levels_empty_graph(self):
        """Test sort_with_levels on empty graph"""
        from src.workflow_codification.composition.dependency_graph import DependencyGraph
        from src.workflow_codification.composition.topological_sorter import TopologicalSorter

        graph = DependencyGraph()
        levels = TopologicalSorter.sort_with_levels(graph)
        assert levels == []

    def test_invalid_execution_mode(self):
        """Test that invalid execution mode raises error"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor

        composite = {
            "name": "test",
            "steps": [{"step_id": "s1", "skill_name": "skill", "params": {}}]
        }

        executor = CompositeExecutor()

        with pytest.raises(ValueError, match="Unknown execution mode"):
            executor.execute_composite(
                composite,
                execution_mode="invalid_mode",
                error_handling="stop_on_error"
            )

    def test_retry_on_error_success_after_retry(self):
        """Test retry_on_error succeeds on second attempt"""
        from src.workflow_codification.composition.composite_executor import CompositeExecutor
        import tempfile
        import os

        # Create a skill that fails first time, succeeds second time
        skills_dir = tempfile.mkdtemp(prefix="retry_skills_")
        retry_skill = os.path.join(skills_dir, "retry-skill")
        os.makedirs(retry_skill, exist_ok=True)
        execute_script = os.path.join(retry_skill, "execute.sh")

        # Use a file to track execution count
        counter_file = os.path.join(skills_dir, "counter.txt")
        with open(counter_file, 'w') as f:
            f.write("0")

        with open(execute_script, 'w') as f:
            f.write(f"""#!/bin/bash
COUNT=$(cat {counter_file})
COUNT=$((COUNT + 1))
echo $COUNT > {counter_file}
if [ $COUNT -eq 1 ]; then
    echo "First attempt - failing"
    exit 1
else
    echo "Second attempt - success"
    exit 0
fi
""")
        os.chmod(execute_script, 0o755)

        composite = {
            "name": "retry-test",
            "steps": [
                {"step_id": "retry_step", "skill_name": "retry-skill", "params": {}}
            ]
        }

        executor = CompositeExecutor()
        executor._build_command = lambda skill_name, params: f"{skills_dir}/{skill_name}/execute.sh"

        result = executor.execute_composite(
            composite,
            execution_mode="sequential",
            error_handling="retry_on_error"
        )

        # Should succeed after retry
        assert result["status"] == "success"
        assert result["step_results"]["retry_step"]["success"] is True

        # Cleanup
        import shutil
        shutil.rmtree(skills_dir)
